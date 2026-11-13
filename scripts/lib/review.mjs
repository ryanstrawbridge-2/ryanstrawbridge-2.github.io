/**
 * What changed, in words: "Lifting Frame: deleted figure "Time per lift";
 * Fig. "Redesign": headline edited, 1 point added".
 *
 * Studio's Save panel compares the working tree with the last save (HEAD);
 * Go live compares it with what's on the live site (origin/main). Both used
 * to list file paths, which says nothing about whether the right edit is in
 * there. This parses both versions of each project's frontmatter and body and
 * describes the difference the way you'd say it out loud.
 */

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import YAML from 'yaml';

const run = promisify(execFile);
const git = async (root, args) => (await run('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })).stdout;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const quote = (s) => `“${String(s).slice(0, 48)}${String(s).length > 48 ? '…' : ''}”`;

const parseProject = (text) => {
  if (!text) return null;
  const m = text.match(FRONTMATTER);
  let data = {};
  try { data = m ? YAML.parse(m[1]) ?? {} : {}; } catch { data = {}; }
  const body = m ? text.slice(m[0].length) : text;
  const sections = {};
  let cur = '(intro)';
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = h[1]; sections[cur] = ''; continue; }
    sections[cur] = `${sections[cur] ?? ''}${line}\n`;
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  return { data, sections };
};

const figName = (f, i) => f?.title || f?.takeaway || `figure ${i + 1}`;

// Section blocks (studio "Add section"), matched by id.
const BLOCK_NAMES = { banner: 'Banner', text: 'Text', split: 'Photo + text', cards: 'Cards', stats: 'Stats', quote: 'Quote', steps: 'Steps', timeline: 'Timeline', logos: 'Logo strip', faq: 'Questions', gallery: 'Gallery', video: 'Video', compare: 'Before / after', tags: 'Skills', links: 'Links list', cta: 'Call to action', marquee: 'Scrolling text', spacer: 'Spacer' };
const blockName = (b) => {
  const kind = BLOCK_NAMES[b?.type] ?? 'section';
  const head = String(b?.heading ?? b?.eyebrow ?? '').replace(/[*_|`]/g, '').trim();
  return head ? `${kind} ${quote(head)}` : kind;
};
export const describeBlocks = (before = [], after = []) => {
  const out = [];
  const a = new Map((before ?? []).map((b) => [b?.id, b]));
  const b = new Map((after ?? []).map((x) => [x?.id, x]));
  for (const [id, blk] of b) {
    const old = a.get(id);
    if (!old) out.push(`Added section: ${blockName(blk)}${blk?.draft ? ' (draft)' : ''}`);
    else if (!same(old, blk)) {
      if (old.draft && !blk.draft) out.push(`Section now live: ${blockName(blk)}`);
      else if (!old.draft && blk.draft) out.push(`Section back to draft: ${blockName(blk)}`);
      else out.push(`Section edited: ${blockName(blk)}`);
    }
  }
  for (const [id, blk] of a) if (!b.has(id)) out.push(`Deleted section: ${blockName(blk)}`);
  return out;
};
const CROP = ['focal', 'zoom', 'compareFocal', 'compareZoom', 'aspect'];

const describeFigure = (a, b) => {
  const bits = [];
  if (!same(a.takeaway, b.takeaway)) bits.push('headline edited');
  if (!same(a.title, b.title)) bits.push('title edited');
  if (!same(a.caption, b.caption)) bits.push(b.caption ? (a.caption ? 'caption edited' : 'caption added') : 'caption removed');
  const pa = a.points ?? [];
  const pb = b.points ?? [];
  if (pb.length > pa.length) bits.push(`${pb.length - pa.length} point${pb.length - pa.length > 1 ? 's' : ''} added`);
  else if (pb.length < pa.length) bits.push(`${pa.length - pb.length} point${pa.length - pb.length > 1 ? 's' : ''} removed`);
  else if (!same(pa, pb)) bits.push('points edited');
  for (const [key, noun] of [['image', 'photo'], ['compare', 'after photo']]) {
    if (same(a[key], b[key])) continue;
    bits.push(!a[key] ? `${noun} added` : !b[key] ? `${noun} removed` : `${noun} replaced`);
  }
  if (CROP.some((k) => !same(a[k], b[k]))) bits.push('crop');
  if (!same(a.callouts, b.callouts)) bits.push('markers');
  if (!same(a.section, b.section)) bits.push(`moved to ${b.section}`);
  if (!same(a.kind, b.kind)) bits.push(`now a ${b.kind}`);
  if (!same(a.plan, b.plan)) bits.push('notes edited');
  return bits;
};

export const describeProject = (beforeText, afterText) => {
  const before = parseProject(beforeText);
  const after = parseProject(afterText);
  if (!before) return ['new project'];
  if (!after) return ['project deleted'];
  const A = before.data;
  const B = after.data;
  const out = [];

  for (const [key, words] of [['title', 'Title'], ['subtitle', 'Subtitle'], ['summary', 'Summary'], ['date', 'Date'], ['organization', 'Organization']]) {
    if (!same(A[key], B[key])) out.push(`${words} edited`);
  }
  if (!same(A.hero, B.hero)) out.push('Main photo replaced');
  else if (['heroFocalPoint', 'heroZoom', 'heroAspect'].some((k) => !same(A[k], B[k]))) out.push('Main photo crop');
  if (!same(A.heroAlt, B.heroAlt)) out.push('Main photo description edited');
  if (!same(A.draft, B.draft)) out.push(B.draft ? 'Marked as draft (hidden from the site)' : 'No longer a draft');

  // Figures: match by name first, then whatever is left by position.
  const fa = A.figures ?? [];
  const fb = B.figures ?? [];
  const usedA = new Set();
  const pairs = [];
  fb.forEach((f, j) => {
    const i = fa.findIndex((g, k) => !usedA.has(k) && figName(g, k) === figName(f, j));
    if (i !== -1) { usedA.add(i); pairs.push([i, j]); }
  });
  fb.forEach((f, j) => {
    if (pairs.some(([, jj]) => jj === j)) return;
    const i = fa.findIndex((_, k) => !usedA.has(k) && k === j);
    if (i !== -1 && describeFigure(fa[i], f).length < 6) { usedA.add(i); pairs.push([i, j]); }
  });
  fa.forEach((f, i) => { if (!usedA.has(i)) out.push(`Deleted figure ${quote(figName(f, i))}`); });
  fb.forEach((f, j) => { if (!pairs.some(([, jj]) => jj === j)) out.push(`Added figure ${quote(figName(f, j))}`); });
  for (const [i, j] of pairs) {
    const bits = describeFigure(fa[i], fb[j]);
    if (bits.length) out.push(`Figure ${quote(figName(fb[j], j))}: ${bits.join(', ')}`);
  }
  const order = (pairs.slice().sort((x, y) => x[1] - y[1]).map(([i]) => i));
  if (order.some((v, k) => k && v < order[k - 1])) out.push('Figures reordered');

  // Gallery photos, matched by the file they show.
  const ref = (g) => g?.image ?? g?.video ?? g?.model ?? '';
  const ga = A.gallery ?? [];
  const gb = B.gallery ?? [];
  const ra = ga.map(ref);
  const rb = gb.map(ref);
  const added = rb.filter((r) => !ra.includes(r)).length;
  const removed = ra.filter((r) => !rb.includes(r)).length;
  if (added) out.push(`${added} photo${added > 1 ? 's' : ''} added`);
  if (removed) out.push(`${removed} photo${removed > 1 ? 's' : ''} removed`);
  const kept = rb.filter((r) => ra.includes(r));
  if (kept.join() !== ra.filter((r) => rb.includes(r)).join()) out.push('Photos reordered');
  let tweaked = 0;
  for (const g of gb) {
    const old = ga.find((h) => ref(h) === ref(g));
    if (old && !same(old, g)) tweaked += 1;
  }
  if (tweaked) out.push(`${tweaked} photo${tweaked > 1 ? 's' : ''} recropped or resized`);

  // Body text, per section.
  const names = new Set([...Object.keys(before.sections), ...Object.keys(after.sections)]);
  for (const name of names) {
    if (name === '(intro)' && !before.sections[name] && !after.sections[name]) continue;
    if (!same(before.sections[name], after.sections[name])) out.push(`${name === '(intro)' ? 'Intro' : `“${name}”`} text edited`);
  }

  out.push(...describeBlocks(A.blocks, B.blocks));
  const known = new Set(['title', 'subtitle', 'summary', 'date', 'organization', 'hero', 'heroAlt', 'heroFocalPoint', 'heroZoom', 'heroAspect', 'figures', 'gallery', 'draft', 'blocks']);
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (!known.has(key) && !same(A[key], B[key])) out.push(`${key} changed`);
  }
  return out;
};

const HOME_SECTIONS = { hero: 'top of the page', aboutSection: 'about', showcase: 'photo collage', interestsSection: 'interests', experienceSection: 'experience' };

const describeJson = (beforeText, afterText) => {
  let a = {};
  let b = {};
  try { a = JSON.parse(beforeText || '{}'); } catch { /* treat as empty */ }
  try { b = JSON.parse(afterText || '{}'); } catch { /* treat as empty */ }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]));
};

/**
 * Group every change between `base` and the working tree into areas.
 * Returns [{ area, items: [string] }].
 */
export const review = async (root, base = 'HEAD') => {
  const tracked = (await git(root, ['diff', '--name-status', base]).catch(() => '')).trim().split('\n').filter(Boolean)
    .map((line) => { const [status, ...rest] = line.split('\t'); return { status: status[0], path: rest.at(-1) }; });
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard'])).trim().split('\n').filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  const changes = [...tracked, ...untracked];

  const show = async (path) => git(root, ['show', `${base}:${path}`]).catch(() => null);
  const disk = async (path) => readFile(join(root, path), 'utf8').catch(() => null);

  const groups = [];
  const media = { added: 0, removed: 0 };
  const code = [];
  for (const { status, path } of changes) {
    const project = path.match(/^src\/content\/projects\/(.+)\.md$/);
    if (project) {
      const after = await disk(path);
      const title = (after && parseProject(after)?.data?.title) || project[1].replace(/-/g, ' ');
      const items = describeProject(await show(path), after);
      groups.push({ area: title, items: items.length ? items : ['formatting only'] });
      continue;
    }
    if (path === 'src/data/home.json') {
      const beforeText = await show(path);
      const afterText = await disk(path);
      const keys = describeJson(beforeText, afterText);
      let blockItems = [];
      try { blockItems = describeBlocks(JSON.parse(beforeText || '{}').blocks, JSON.parse(afterText || '{}').blocks); } catch { /* fall back to key names */ }
      const items = [
        ...keys.filter((k) => k !== 'blocks').map((k) => (k === 'layout' ? 'layout (spacing, order) edited' : `${HOME_SECTIONS[k] ?? k} edited`)),
        ...blockItems,
      ];
      groups.push({ area: 'Home page', items: items.length ? items : ['formatting only'] });
      continue;
    }
    if (path === 'src/data/site.json') { groups.push({ area: 'Theme', items: describeJson(await show(path), await disk(path)).map((k) => `${k} changed`) }); continue; }
    if (path === 'src/data/navigation.json') { groups.push({ area: 'Navigation', items: ['menu edited'] }); continue; }
    if (/^(src\/assets\/images|public\/(videos|models))\//.test(path)) {
      if (status === 'D') media.removed += 1; else if (status === 'A') media.added += 1;
      continue;
    }
    code.push(path);
  }
  if (media.added || media.removed) {
    groups.push({ area: 'Photo files', items: [
      ...(media.added ? [`${media.added} new file${media.added > 1 ? 's' : ''} (resized, metadata stripped)`] : []),
      ...(media.removed ? [`${media.removed} file${media.removed > 1 ? 's' : ''} removed`] : []),
    ] });
  }
  if (code.length) {
    groups.push({ area: 'Site code and settings', items: code.length > 6 ? [`${code.length} files`] : code });
  }
  return groups;
};
