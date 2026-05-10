#!/usr/bin/env node
// Normalizes image paths that TinaCMS sometimes writes in a broken form.
// Runs as part of `npm run build` (and you can run it standalone).
//
// Background: Astro's content-collection image() resolver expects paths like
//   ../../assets/images/projects/<slug>/<file>
// TinaCMS sometimes writes them as
//   /src/assets/images../../assets/images/projects/<slug>/<file>     (concat bug)
//   /src/assets/images/projects/<slug>/<file>                        (mediaRoot prefix)
// This script rewrites both forms back to the relative form Astro wants.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const CONTENT_DIRS = [join(ROOT, 'src/content/projects')];
const DATA_DIRS = [join(ROOT, 'src/data')];

const ASTRO = '../../assets/images/';

// Patterns to fix, in order. Each is [regex, replacement].
const FIXES = [
  // Concat bug: /src/assets/images../../assets/images/X → ../../assets/images/X
  [/\/src\/assets\/images\.\.\/\.\.\/assets\/images\//g, ASTRO],
  // Plain mediaRoot prefix from Tina: /src/assets/images/X → ../../assets/images/X
  [/\/src\/assets\/images\//g, ASTRO],
];

let totalFixed = 0;

async function processFile(path) {
  const original = await readFile(path, 'utf8');
  let next = original;
  for (const [pattern, replacement] of FIXES) {
    next = next.replace(pattern, replacement);
  }
  if (next !== original) {
    await writeFile(path, next, 'utf8');
    const count = (original.match(/\/src\/assets\/images/g) || []).length;
    console.log(`  fixed ${count} path(s) in ${path.replace(ROOT, '')}`);
    totalFixed += count;
  }
}

async function walk(dir, exts) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, exts);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      await processFile(full);
    }
  }
}

console.log('Normalizing CMS-written image paths…');
for (const dir of CONTENT_DIRS) await walk(dir, ['.md', '.mdx']);
for (const dir of DATA_DIRS) await walk(dir, ['.json']);
console.log(totalFixed === 0 ? '✓ no broken paths found' : `✓ fixed ${totalFixed} path(s)`);
