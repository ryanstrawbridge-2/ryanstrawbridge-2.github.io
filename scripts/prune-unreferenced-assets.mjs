#!/usr/bin/env node
// Deletes image assets that ended up in dist/_astro without anything linking
// to them. Runs after `astro build`.
//
// Background: Astro emits the untouched original for every content-collection
// image() field alongside the resized variants it actually uses. Those
// originals are never referenced, but they are publicly fetchable — full
// resolution, with camera EXIF (device, exact capture timestamp, UUIDs) still
// attached. For photos taken on a customer's manufacturing floor that's an
// unnecessary disclosure, and it's ~18 MB of dead weight besides.
//
// Only touches dist/_astro. The CMS thumbnails under dist/src/assets/images
// are deliberately unreferenced by any page — the editor loads them directly —
// so they're out of scope here.

import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const ASTRO_DIR = join(DIST, '_astro');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
// Files that can reference an asset. Note .json/.js: the visual-editing bridge
// and any client island can carry asset paths in a payload.
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt']);

if (!existsSync(ASTRO_DIR)) {
  console.log('prune-assets: no dist/_astro, nothing to do');
  process.exit(0);
}

const walk = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
};

const all = await walk(DIST);

// Collect assets referenced as an actual _astro URL. Matching bare filenames
// is too loose: the visual-editing payload carries hashed basenames as plain
// text, and treating those as references keeps every original alive.
const referenced = new Set();
for (const file of all) {
  if (!TEXT_EXT.has(extname(file).toLowerCase())) continue;
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(
    /_astro\/([\w.-]+\.(?:jpe?g|png|webp|avif|gif|svg))/gi,
  )) {
    referenced.add(match[1]);
  }
}

const candidates = all.filter(
  (f) => f.startsWith(ASTRO_DIR) && IMAGE_EXT.has(extname(f).toLowerCase()),
);

let removed = 0;
let bytes = 0;
for (const file of candidates) {
  const name = file.split('/').pop();
  if (referenced.has(name)) continue;
  bytes += (await stat(file)).size;
  await unlink(file);
  removed++;
}

// Guard: every image the HTML actually asks for must still be on disk. If this
// trips, the pattern above missed a reference format and the build is broken.
const missing = [];
for (const file of all) {
  if (extname(file).toLowerCase() !== '.html' || !existsSync(file)) continue;
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/\/_astro\/([\w.-]+\.(?:jpe?g|png|webp|avif|gif|svg))/gi)) {
    if (!existsSync(join(ASTRO_DIR, match[1]))) missing.push(`${file}: ${match[1]}`);
  }
}

if (missing.length) {
  console.error('prune-assets: FATAL — deleted an asset that pages still reference:');
  missing.slice(0, 10).forEach((m) => console.error(`  ${m}`));
  process.exit(1);
}

console.log(
  `prune-assets: removed ${removed} unreferenced image(s), ${(bytes / 1024 / 1024).toFixed(1)} MB freed`,
);
