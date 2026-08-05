#!/usr/bin/env node
// Emits small previews of every source image at the path the CMS asks for.
// Runs after `astro build`.
//
// Background: TinaCMS has mediaRoot 'src/assets/images', so the media manager
// and every image field point at /src/assets/images/<path>. Nothing serves
// that — Astro compiles these images into hashed /_astro/ files and the
// originals never reach dist — so every thumbnail in the editor is a dead
// link and photos are indistinguishable in the form.
//
// Copying the originals would add ~38 MB to a ~43 MB site. These previews are
// capped at 400px and land around 1-2 MB total, which is all a thumbnail needs.
// Format is preserved so the extension in the URL still matches the bytes.

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url).pathname;
const SOURCE = join(ROOT, 'src/assets/images');
const OUT = join(ROOT, 'dist/src/assets/images');

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const MAX_EDGE = 400;

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (RASTER.has(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out;
};

let count = 0;
let bytes = 0;

let files = [];
try {
  files = await walk(SOURCE);
} catch {
  console.log('cms-thumbnails: no src/assets/images, nothing to do');
  process.exit(0);
}

for (const file of files) {
  const rel = relative(SOURCE, file);
  const dest = join(OUT, rel);
  await mkdir(dirname(dest), { recursive: true });

  const ext = extname(file).toLowerCase();
  const pipeline = sharp(file).rotate().resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Keep the original format — the URL's extension has to match the bytes.
  if (ext === '.png') pipeline.png({ quality: 75, compressionLevel: 9 });
  else if (ext === '.webp') pipeline.webp({ quality: 72 });
  else if (ext === '.avif') pipeline.avif({ quality: 55 });
  else pipeline.jpeg({ quality: 72, mozjpeg: true });

  const buffer = await pipeline.toBuffer();
  await writeFile(dest, buffer);
  count++;
  bytes += buffer.length;
}

const sourceBytes = (
  await Promise.all(files.map(async (f) => (await stat(f)).size))
).reduce((a, b) => a + b, 0);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `cms-thumbnails: ${count} preview(s), ${mb(bytes)} (originals ${mb(sourceBytes)})`,
);
