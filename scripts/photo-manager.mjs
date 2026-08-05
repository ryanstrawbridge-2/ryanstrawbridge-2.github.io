#!/usr/bin/env node
// Local photo review tool. `npm run photos` → http://localhost:4400
//
// Built for scrubbing customer IP off the site: see every photo at once with
// its project, capture timestamp and usage, then remove, redact, or re-caption
// without touching a terminal.
//
// Nothing here deletes. "Remove" moves files into .photo-trash/ (gitignored)
// and strips their references from the markdown, so any removal can be undone
// from the same screen.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import sharp from 'sharp';
import { buildInventory } from './photo-inventory.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const IMAGES = join(ROOT, 'src/assets/images');
const PROJECTS = join(ROOT, 'src/content/projects');
const TRASH = join(ROOT, '.photo-trash');
const PORT = 4400;

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });

/** Drop every gallery entry and body image that points at `basename`. */
const stripReferences = async (basename) => {
  const touched = [];
  for (const file of (await readdir(PROJECTS)).filter((f) => f.endsWith('.md'))) {
    const path = join(PROJECTS, file);
    const before = await readFile(path, 'utf8');
    if (!before.includes(basename)) continue;

    const lines = before.split('\n');
    const keep = [];
    for (let i = 0; i < lines.length; i++) {
      // A gallery entry is `  - image: ...` plus its indented alt/caption rows.
      if (/^\s*-\s*image:/.test(lines[i]) && lines[i].includes(basename)) {
        i++;
        while (i < lines.length && /^\s{4,}\w+:/.test(lines[i])) i++;
        i--;
        continue;
      }
      // A body image is a standalone markdown image line.
      if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(lines[i]) && lines[i].includes(basename)) continue;
      keep.push(lines[i]);
    }
    const after = keep.join('\n');
    if (after !== before) {
      await writeFile(path, after);
      touched.push(file);
    }
  }
  return touched;
};

const routes = {
  '/api/inventory': async (req, res) => json(res, 200, await buildInventory()),

  '/api/remove': async (req, res) => {
    const { paths = [] } = await readBody(req);
    const moved = [];
    for (const rel of paths) {
      const src = join(IMAGES, rel);
      if (!existsSync(src)) continue;
      const dest = join(TRASH, rel);
      await mkdir(dirname(dest), { recursive: true });
      await rename(src, dest);
      const touched = await stripReferences(rel.split('/').pop());
      moved.push({ path: rel, touched });
    }
    json(res, 200, { moved });
  },

  '/api/restore': async (req, res) => {
    const { paths = [] } = await readBody(req);
    const restored = [];
    for (const rel of paths) {
      const src = join(TRASH, rel);
      if (!existsSync(src)) continue;
      const dest = join(IMAGES, rel);
      await mkdir(dirname(dest), { recursive: true });
      await rename(src, dest);
      restored.push(rel);
      // References were stripped on removal; re-adding them is a manual call,
      // so say so rather than silently leaving the photo unused.
    }
    json(res, 200, { restored, note: 'File restored. Re-add it to a project in the CMS.' });
  },

  '/api/trash': async (req, res) => {
    const walk = async (dir, base = '', out = []) => {
      if (!existsSync(dir)) return out;
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(p, rel, out);
        else out.push(rel);
      }
      return out;
    };
    json(res, 200, { items: await walk(TRASH) });
  },

  '/api/strip-exif': async (req, res) => {
    const { paths = [] } = await readBody(req);
    const done = [];
    for (const rel of paths) {
      const src = join(IMAGES, rel);
      if (!existsSync(src)) continue;
      // Re-encode without metadata. sharp drops EXIF unless withMetadata() is
      // called, so a plain round-trip is the strip.
      const ext = extname(rel).toLowerCase();
      const pipe = sharp(src).rotate();
      if (ext === '.png') pipe.png();
      else if (ext === '.webp') pipe.webp({ quality: 90 });
      else pipe.jpeg({ quality: 92 });
      const buf = await pipe.toBuffer();
      await writeFile(src, buf);
      done.push(rel);
    }
    json(res, 200, { stripped: done });
  },

  '/api/redact': async (req, res) => {
    // Blur rectangles over a photo — for badges, screens, whiteboards, part
    // numbers. Regions arrive as fractions of the image so the UI doesn't have
    // to know the real pixel size.
    const { path: rel, regions = [] } = await readBody(req);
    const src = join(IMAGES, rel);
    if (!existsSync(src) || !regions.length) return json(res, 400, { error: 'bad request' });

    const img = sharp(src);
    const { width, height } = await img.metadata();
    const base = await img.rotate().toBuffer();
    const { width: w, height: h } = await sharp(base).metadata();

    const overlays = [];
    for (const r of regions) {
      const left = Math.max(0, Math.round(r.x * w));
      const top = Math.max(0, Math.round(r.y * h));
      const rw = Math.min(w - left, Math.round(r.w * w));
      const rh = Math.min(h - top, Math.round(r.h * h));
      if (rw < 2 || rh < 2) continue;
      const patch = await sharp(base)
        .extract({ left, top, width: rw, height: rh })
        .blur(Math.max(8, Math.round(Math.min(rw, rh) / 6)))
        .toBuffer();
      overlays.push({ input: patch, left, top });
    }
    if (!overlays.length) return json(res, 400, { error: 'regions too small' });

    // Keep the pre-redaction file in trash — a blur is not reversible.
    const backup = join(TRASH, '_pre-redact', rel);
    await mkdir(dirname(backup), { recursive: true });
    await writeFile(backup, await readFile(src));

    const out = await sharp(base).composite(overlays).toBuffer();
    await writeFile(src, out);
    json(res, 200, { redacted: rel, regions: overlays.length, backup: `.photo-trash/_pre-redact/${rel}`, width, height });
  },

  '/api/caption': async (req, res) => {
    const { basename, alt, caption } = await readBody(req);
    const touched = [];
    for (const file of (await readdir(PROJECTS)).filter((f) => f.endsWith('.md'))) {
      const path = join(PROJECTS, file);
      const before = await readFile(path, 'utf8');
      if (!before.includes(basename)) continue;
      const lines = before.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*-\s*image:/.test(lines[i]) || !lines[i].includes(basename)) continue;
        let j = i + 1;
        const block = [];
        while (j < lines.length && /^\s{4,}\w+:/.test(lines[j])) block.push(j++);
        const setField = (name, value) => {
          if (value == null) return;
          const idx = block.find((b) => lines[b].trim().startsWith(`${name}:`));
          const quoted = /^[\w][\w .,\-/&()]*$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
          if (idx != null) lines[idx] = `    ${name}: ${quoted}`;
          else lines.splice(j, 0, `    ${name}: ${quoted}`);
        };
        setField('alt', alt);
        setField('caption', caption);
        break;
      }
      const after = lines.join('\n');
      if (after !== before) {
        await writeFile(path, after);
        touched.push(file);
      }
    }
    json(res, 200, { touched });
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (routes[url.pathname]) return routes[url.pathname](req, res);

  // Scaled preview of a source image (or a trashed one).
  if (url.pathname.startsWith('/img/')) {
    const rel = decodeURIComponent(url.pathname.slice(5));
    const fromTrash = url.searchParams.get('trash') === '1';
    const file = join(fromTrash ? TRASH : IMAGES, rel);
    if (!file.startsWith(fromTrash ? TRASH : IMAGES) || !existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    const buf = await sharp(file)
      .rotate()
      .resize({ width: Number(url.searchParams.get('w')) || 480, withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' });
    return res.end(buf);
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(await readFile(join(ROOT, 'scripts/photo-manager.html'), 'utf8'));
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  Photo manager → http://localhost:${PORT}\n`);
  console.log('  Removals move files to .photo-trash/ and can be undone in the app.');
  console.log('  Ctrl-C to stop.\n');
});
