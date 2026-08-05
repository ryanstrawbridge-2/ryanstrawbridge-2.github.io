#!/usr/bin/env node
// Builds an inventory of every image in the repo: where it lives, which
// project uses it, whether that project is customer work, its dimensions, and
// what EXIF the source file still carries.
//
// Shared by `npm run photos` (the review UI) and `npm run photos:report`.
// Read-only — nothing here deletes or edits.

import { readdir, readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url).pathname;
const IMAGES = join(ROOT, 'src/assets/images');
const PROJECTS = join(ROOT, 'src/content/projects');
const DATA = join(ROOT, 'src/data');

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

// Organizations whose photos deserve a second look before publishing.
const SENSITIVE_ORGS = [/commonwealth\s*fusion/i, /raytheon/i];

const walk = async (dir, out = []) => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (RASTER.has(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out;
};

const exifSummary = (buffer) => {
  if (!buffer) return null;
  const text = buffer.toString('latin1');
  const date = text.match(/(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/);
  const make = text.match(/(Apple|Canon|NIKON|SONY|FUJIFILM|samsung|Google)/i);
  const model = text.match(/(iPhone [\w\s]+?|Pixel \d\w*)[\x00\s]/);
  return {
    captured: date?.[1] ?? null,
    device: [make?.[1], model?.[1]?.trim()].filter(Boolean).join(' ') || null,
    hasGps: /GPSLatitude|GPSLongitude/.test(text),
  };
};

export const buildInventory = async () => {
  // Map every project's frontmatter + body so we know what references what.
  const projects = [];
  for (const file of (await readdir(PROJECTS)).filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(join(PROJECTS, file), 'utf8');
    const org = raw.match(/^organization:\s*(.+)$/m)?.[1]?.replace(/['"]/g, '').trim() ?? '';
    projects.push({
      slug: file.replace(/\.md$/, ''),
      title: raw.match(/^title:\s*(.+)$/m)?.[1]?.replace(/['"]/g, '').trim() ?? file,
      organization: org,
      sensitive: SENSITIVE_ORGS.some((re) => re.test(org)),
      draft: /^draft:\s*true/m.test(raw),
      raw,
    });
  }

  // Site-wide JSON (home page image keys, etc.) counts as a reference too.
  let dataBlob = '';
  for (const file of (await readdir(DATA)).filter((f) => f.endsWith('.json'))) {
    dataBlob += await readFile(join(DATA, file), 'utf8');
  }

  const files = await walk(IMAGES);
  const items = [];

  for (const file of files) {
    const rel = relative(IMAGES, file);
    const basename = rel.split('/').pop();
    let meta = {};
    try {
      meta = await sharp(file).metadata();
    } catch {
      /* unreadable image — still list it */
    }

    const usedBy = projects
      .filter((p) => p.raw.includes(basename))
      .map((p) => ({ slug: p.slug, title: p.title, sensitive: p.sensitive, draft: p.draft }));

    // Home-page images are referenced by key, not filename.
    const keyed = dataBlob.includes(basename) || dataBlob.includes(basename.replace(/\.\w+$/, ''));

    items.push({
      path: rel,
      absPath: file,
      bytes: statSync(file).size,
      width: meta.width ?? null,
      height: meta.height ?? null,
      exif: exifSummary(meta.exif),
      usedBy,
      keyedInData: keyed,
      orphan: usedBy.length === 0 && !keyed,
      sensitive: usedBy.some((u) => u.sensitive),
    });
  }

  items.sort((a, b) => {
    if (a.sensitive !== b.sensitive) return a.sensitive ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  return { items, projects: projects.map(({ raw, ...p }) => p) };
};

// Allow running standalone for a quick look.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { items } = await buildInventory();
  console.log(`${items.length} images`);
  console.log(`  ${items.filter((i) => i.sensitive).length} on customer-work projects`);
  console.log(`  ${items.filter((i) => i.orphan).length} unreferenced`);
  console.log(`  ${items.filter((i) => i.exif?.captured).length} with a capture timestamp`);
}
