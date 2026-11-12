#!/usr/bin/env node
/**
 * `npm run studio:test` — end-to-end check of the live editor.
 *
 * Needs `npm run studio` running. Exercises every writer route against a real
 * project (and home.json), then undoes all of it and proves the content, data
 * and media files are byte-for-byte what they were. Also checks that every
 * page renders, the overlay's modules are served, and the production build
 * carries no studio code (pass --build).
 *
 * Safe to run on a working tree with unsaved edits: they are part of the
 * snapshot and come back exactly. If anything fails it stops editing and
 * undoes what it did before reporting.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://127.0.0.1:4322';
const SITE = 'http://localhost:4321';
const ORIGIN = { origin: 'http://localhost:4321', 'content-type': 'application/json' };
const SLUG = process.env.STUDIO_TEST_SLUG || 'lifting-frame';

let failures = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const fingerprint = () => {
  const map = new Map();
  for (const dir of ['src/content', 'src/data', 'src/assets/images', 'public/videos', 'public/models']) {
    for (const f of walk(join(ROOT, dir))) map.set(relative(ROOT, f), createHash('sha1').update(readFileSync(f)).digest('hex'));
  }
  return map;
};
const diff = (a, b) => {
  const out = [];
  for (const [k, v] of a) if (b.get(k) !== v) out.push(b.has(k) ? `changed ${k}` : `missing ${k}`);
  for (const k of b.keys()) if (!a.has(k)) out.push(`extra ${k}`);
  return out;
};

const post = async (path, body) => {
  const r = await fetch(API + path, { method: 'POST', headers: ORIGIN, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${j.error || j.reason || r.status}`);
  return j;
};
const health = async () => (await fetch(`${API}/health`)).json();

// ---------------------------------------------------------------------------
console.log('\nstudio:test\n');
try { await health(); } catch {
  console.log('  The studio writer is not running. Start it with `npm run studio` and run this again.\n');
  process.exit(1);
}

// 1. Pages render and the overlay loads.
console.log('pages');
const slugs = readdirSync(join(ROOT, 'src/content/projects')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
for (const path of ['/', '/projects/', ...slugs.map((s) => `/projects/${s}/`)]) {
  try {
    const r = await fetch(SITE + path);
    const html = await r.text();
    if (r.status !== 200) bad(`${path} -> ${r.status}`);
    else if (path !== '/projects/' && !html.includes('/overlay/main.js')) bad(`${path} has no studio overlay`);
    else ok(`${path}`);
  } catch (e) { bad(`${path}: ${e.message} (is astro dev running?)`); }
}
for (const file of readdirSync(join(ROOT, 'scripts/studio'))) {
  const r = await fetch(`${API}/overlay/${file}`);
  if (r.status !== 200) bad(`overlay/${file} -> ${r.status}`);
}
ok(`overlay modules served (${readdirSync(join(ROOT, 'scripts/studio')).length})`);

// 2. Every write route, then undo all of it.
console.log('\nwrites (all undone afterwards)');
const before = fingerprint();
const startDepth = (await health()).undo.depth;
// A real 32x32 PNG, so it goes through the same encode() as a dropped photo.
const pixel = (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#4a7' } }).png().toBuffer()).toString('base64');
const steps = [
  ['patch a gallery row', () => post('/project/patch', { slug: SLUG, patch: { 'gallery.0.width': 'half' } })],
  ['patch frontmatter', () => post('/project/patch', { slug: SLUG, patch: { subtitle: 'studio:test' } })],
  ['add a figure', () => post('/project/list', { slug: SLUG, path: 'figures', op: 'add', value: { section: 'Outcome', kind: 'diagram', title: 'studio:test figure' } })],
  ['add a point', async () => {
    const figs = (await post('/project/value', { slug: SLUG, path: 'figures', json: true })).value ?? [];
    return post('/project/list', { slug: SLUG, path: `figures.${figs.length - 1}.points`, op: 'add', value: 'studio:test point' });
  }],
  ['add a marker', async () => {
    const figs = (await post('/project/value', { slug: SLUG, path: 'figures', json: true })).value ?? [];
    return post('/project/list', { slug: SLUG, path: `figures.${figs.length - 1}.callouts`, op: 'add', value: { x: 50, y: 50, label: 'test', place: 'right' } });
  }],
  ['upload into a figure', async () => {
    const figs = (await post('/project/value', { slug: SLUG, path: 'figures', json: true })).value ?? [];
    return post('/media', { slug: SLUG, target: { kind: 'figure', figure: figs.length - 1 }, filename: 'studio-test.png', data: pixel });
  }],
  ['upload to the gallery', () => post('/media', { slug: SLUG, target: { kind: 'gallery', section: 'Outcome' }, filename: 'studio-test-2.png', data: pixel })],
  ['reorder the gallery', () => post('/project/list', { slug: SLUG, path: 'gallery', op: 'move', from: 0, to: 1 })],
  ['edit a body section', async () => {
    const v = (await post('/project/section/read', { slug: SLUG, section: 'outcome' })).value;
    return post('/project/section', { slug: SLUG, section: 'outcome', value: `${v}\n\n* studio:test` });
  }],
  ['add a home tile', () => post('/home/list', { path: 'showcase.items', op: 'add' })],
  ['theme setting', () => post('/site/theme', { patch: { cornerStyle: 'sharp' } })],
];
let done = 0;
for (const [name, fn] of steps) {
  try { await fn(); done += 1; ok(name); } catch (e) { bad(`${name}: ${e.message}`); break; }
}
const made = (await health()).undo.depth - startDepth;
try {
  if (made > 0) await post('/undo', { steps: made });
  ok(`undid ${made} edit(s) in one step`);
} catch (e) { bad(`undo: ${e.message}`); }
// Redo then undo once more, to prove redo works and leaves nothing behind.
try {
  await post('/redo', {});
  await post('/undo', {});
  ok('redo + undo');
} catch (e) { bad(`redo: ${e.message}`); }
// Leave no test edits behind for a stray ⌘⇧Z to bring back.
try { await post('/redo/clear', {}); } catch (e) { bad(`clearing redo: ${e.message}`); }
await new Promise((r) => setTimeout(r, 300));
const changes = diff(before, fingerprint());
if (changes.length) bad(`files not restored exactly:\n        ${changes.slice(0, 10).join('\n        ')}`);
else ok('every content, data and media file is byte-identical to before');

// 3. Reads.
console.log('\nreads');
for (const [name, path] of [['save status', '/save/status'], ['change review', '/save/review'], ['live review', '/save/review?base=live'], ['library', `/library?slug=${SLUG}`]]) {
  const r = await fetch(API + path);
  if (r.status === 200) ok(name); else bad(`${name} -> ${r.status}`);
}

// 4. Optional: production build has no studio in it.
if (process.argv.includes('--build')) {
  console.log('\nproduction build');
  try {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore' });
    const leaks = walk(join(ROOT, 'dist')).filter((f) => /\.(html|js|css)$/.test(f))
      .filter((f) => /overlay\/main\.js|data-field="|studio-bar|127\.0\.0\.1:4322/.test(readFileSync(f, 'utf8')));
    if (leaks.length) bad(`studio code in the build: ${leaks.slice(0, 3).map((f) => relative(ROOT, f)).join(', ')}`);
    else ok('builds, and no studio code reaches dist/');
  } catch { bad('npm run build failed'); }
}

console.log(failures ? `\n${failures} problem(s).\n` : '\nAll good.\n');
process.exit(failures ? 1 : 0);
