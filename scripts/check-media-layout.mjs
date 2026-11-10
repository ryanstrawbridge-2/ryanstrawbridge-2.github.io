/**
 * Keep src/assets/images/ organized.
 *
 * The root used to collect loose uploads: 20 files with camera names
 * (IMG_1834.JPEG, Picture1.jpg, cc119be8-5ba7-4655-806b-5dd4b14320ad.jpg)
 * plus a "11/9/" date folder, one of whose filenames contained a space.
 * Pages CMS wrote every home-page image field straight to the root until
 * .pages.yml was pointed at home/; this catches whatever finds the next way in.
 *
 * Warn-only by default so it can never fail a deploy and leave the live site
 * silently stale (same reasoning as check:tina). `--strict` exits non-zero,
 * which is how publish.sh runs it.
 */
import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const IMAGES = join(ROOT, 'src/assets/images');
const ALLOWED_TOP = new Set(['about', 'experience', 'home', 'projects']);
const MEDIA = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

// Names that say nothing about what the picture shows.
const OPAQUE = [
  /^IMG[-_]?\d+/i,
  /^DSC[-_]?\d+/i,
  /^Picture\d+/i,
  /^Screenshot/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(image|photo|untitled|sample)\d*$/i,
];

const problems = [];

const walk = async (dir, rel = '') => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const here = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { await walk(join(dir, e.name), here); continue; }
    if (!MEDIA.test(e.name)) continue;

    if (!rel) problems.push(`loose at the root: ${here}  -> move into projects/<slug>/, home/, about/ or experience/`);
    if (/\s/.test(e.name)) problems.push(`space in filename: ${here}`);
    if (/ \d+\.[a-z]+$/i.test(e.name)) problems.push(`iCloud conflict copy: ${here}`);

    const stem = e.name.slice(0, e.name.length - extname(e.name).length);
    if (OPAQUE.some((re) => re.test(stem)))
      problems.push(`name says nothing about the photo: ${here}`);
  }
};

for (const e of await readdir(IMAGES, { withFileTypes: true }))
  if (e.isDirectory() && !ALLOWED_TOP.has(e.name) && e.name !== '.DS_Store')
    problems.push(`unexpected top-level folder: ${e.name}/  -> expected one of ${[...ALLOWED_TOP].join(', ')}`);

await walk(IMAGES);

const strict = process.argv.includes('--strict');
if (!problems.length) {
  console.log('check:media — src/assets/images is organized');
  process.exit(0);
}
console.error(`check:media — ${problems.length} issue(s):`);
for (const p of problems) console.error('  ' + p);
console.error('\nRun `npm run photos` to file new media, or move it by hand and update the reference.');
process.exit(strict ? 1 : 0);
