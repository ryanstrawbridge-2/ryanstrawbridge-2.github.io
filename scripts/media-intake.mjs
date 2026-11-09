#!/usr/bin/env node
/**
 * Photo + video intake.  `npm run photos`
 *
 * Drop originals into photo-inbox/<project-slug>/ and run it. For each file:
 *   - bakes in EXIF rotation, then strips ALL metadata (GPS, camera, timestamps)
 *   - resizes so the long edge is at most 2400px
 *   - re-encodes (PNG stays PNG, everything else becomes JPEG q82)
 *   - files it into src/assets/images/projects/<slug>/ under a readable name
 *   - appends a gallery row to src/content/projects/<slug>.md
 *
 * Videos (.mp4) go to public/videos/ and get a gallery row with the `video`
 * field filled in instead of `image`.
 *
 * Originals are never deleted. Files taken from the inbox are moved aside to
 * photo-inbox/_done/, and files named by path are only read. portfolio-photos/
 * is your 262 MB library of originals — this script never writes there, but you
 * can point it at a folder inside it:
 *
 *   npm run photos -- lifting-frame "portfolio-photos/3 Point Lifting Frame"
 *
 * Why this exists: uploading through the CMS drops the untouched original into
 * the ROOT of src/assets/images/ — which is how a 14 MB PNG and a 9.2 MB JPEG
 * ended up committed, and why 19 files sit loose there with names like
 * IMG_6268.jpeg. Both problems are upstream of the editor, so they get fixed
 * here rather than worked around later.
 *
 * Flags:
 *   --dry-run       show what would happen, touch nothing
 *   --jpeg          force PNG sources to JPEG too (smaller; bad for line art)
 *   --no-append     process files but leave the markdown alone
 *   --max <px>      long-edge cap, default 2400
 *   --library       list the folders in portfolio-photos/ with their paths
 *   --shrink        ignore the inbox; re-encode oversized files already in
 *                   src/assets/images/ in place, leaving paths untouched
 *   --over <mb>     size threshold for --shrink, default 3
 */

import { readdir, readFile, writeFile, mkdir, stat, copyFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename, relative } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = join(ROOT, 'photo-inbox');
const DONE = join(INBOX, '_done');
const LIBRARY = join(ROOT, 'portfolio-photos');
const IMAGES = join(ROOT, 'src/assets/images/projects');
const VIDEOS = join(ROOT, 'public/videos');
const CONTENT = join(ROOT, 'src/content/projects');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov']);

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.match(/^--(max|over)$/));

const DRY = flag('dry-run');
const FORCE_JPEG = flag('jpeg');
const APPEND = !flag('no-append');
const MAX_EDGE = Number(value('max', 2400));
const OVER_MB = Number(value('over', 3));
const SHRINK = flag('shrink');
const LIST_LIBRARY = flag('library');

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
// encoding — one place so intake and --shrink can't drift apart
// ---------------------------------------------------------------------------
/**
 * Re-encode a buffer. Returns { data, ext }.
 *
 * PNG sources stay PNG by default: a CAD render or a dimensioned screenshot is
 * line art, and JPEG puts ringing along every edge. Photographs go to JPEG,
 * which is several times smaller at a quality nobody can see the difference in.
 * sharp drops metadata unless asked to keep it, so EXIF (including GPS) goes
 * away for free — .rotate() first so orientation survives the strip.
 */
const encode = async (input, sourceExt) => {
  const pipeline = sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

  const keepPng = sourceExt === '.png' && !FORCE_JPEG;
  if (keepPng) {
    return { data: await pipeline.png({ compressionLevel: 9, effort: 8 }).toBuffer(), ext: '.png' };
  }
  return {
    data: await pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer(),
    ext: '.jpg',
  };
};

/** Same pipeline, but pinned to the source container. Used by --shrink. */
const encodeKeepingFormat = async (input, sourceExt) => {
  const pipeline = sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  if (sourceExt === '.png') {
    return { data: await pipeline.png({ compressionLevel: 9, effort: 8 }).toBuffer(), ext: '.png' };
  }
  if (sourceExt === '.webp') {
    return { data: await pipeline.webp({ quality: 82 }).toBuffer(), ext: '.webp' };
  }
  return {
    data: await pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer(),
    ext: sourceExt,
  };
};

// ---------------------------------------------------------------------------
// frontmatter: append gallery rows without reformatting the rest
//
// gray-matter + js-yaml would round-trip the whole block and rewrite quoting,
// key order and line wrapping on frontmatter the CMS also writes. That turns a
// 3-line addition into a 30-line diff and invites a merge conflict with the
// next CMS commit, so the insert is textual and surgical instead.
// ---------------------------------------------------------------------------
const yamlString = (s) => {
  if (s === undefined || s === null || s === '') return null;
  // Quote anything YAML could read as something other than a plain string.
  return /^[\w][\w ().,/+-]*$/.test(s) ? s : `'${String(s).replace(/'/g, "''")}'`;
};

const galleryRow = ({ image, video, alt, caption }) => {
  const lines = [];
  if (video) lines.push(`  - video: ${video}`);
  else lines.push(`  - image: ../../assets/images/projects/${image}`);
  const a = yamlString(alt);
  if (a) lines.push(`    alt: ${a}`);
  const c = yamlString(caption);
  if (c) lines.push(`    caption: ${c}`);
  return lines.join('\n');
};

const appendToFrontmatter = async (slug, rows) => {
  const file = join(CONTENT, `${slug}.md`);
  if (!existsSync(file)) {
    console.log(`    ! no src/content/projects/${slug}.md — skipping the markdown update`);
    return false;
  }
  const source = await readFile(file, 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    console.log(`    ! ${slug}.md has no frontmatter block — skipping the markdown update`);
    return false;
  }

  const fm = match[1].split('\n');
  const block = rows.join('\n');

  // A top-level key is a line starting in column 0 with "key:".
  const topLevelAt = (i) => /^[A-Za-z_][\w-]*:/.test(fm[i]);
  const galleryIndex = fm.findIndex((line) => /^gallery:/.test(line));

  let next;
  if (galleryIndex === -1) {
    // No gallery yet. Put it before `tools:` if that exists (keeps the visual
    // fields together), otherwise at the end of the block.
    const toolsIndex = fm.findIndex((line) => /^tools:/.test(line));
    const at = toolsIndex === -1 ? fm.length : toolsIndex;
    next = [...fm.slice(0, at), 'gallery:', block, ...fm.slice(at)];
  } else {
    // Walk to the end of the gallery block: the next top-level key, or EOF.
    let end = galleryIndex + 1;
    while (end < fm.length && !topLevelAt(end)) end += 1;
    next = [...fm.slice(0, end), block, ...fm.slice(end)];
  }

  const updated = source.replace(match[0], `---\n${next.join('\n')}\n---\n`);
  if (!DRY) await writeFile(file, updated, 'utf8');
  return true;
};

// ---------------------------------------------------------------------------
// --shrink: re-encode oversized files already committed
// ---------------------------------------------------------------------------
const walkImages = async (dir, out = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walkImages(full, out);
    else if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
};

const runShrink = async () => {
  const root = join(ROOT, 'src/assets/images');
  const files = await walkImages(root);
  const limit = OVER_MB * 1024 * 1024;
  let before = 0;
  let after = 0;
  let touched = 0;

  console.log(`Re-encoding anything over ${OVER_MB} MB in src/assets/images/ …\n`);
  for (const file of files) {
    const { size } = await stat(file);
    if (size < limit) continue;
    const ext = extname(file).toLowerCase();
    // Shrinking rewrites a file under its existing name, so the format has to
    // stay put: a .png holding JPEG bytes would sail past sharp and trip
    // Astro's own extension-based probe. --jpeg is an intake-only option.
    const { data, ext: outExt } = await encodeKeepingFormat(await readFile(file), ext);
    if (data.length >= size) {
      console.log(`  = ${relative(ROOT, file)} — already minimal, left alone`);
      continue;
    }
    before += size;
    after += data.length;
    touched += 1;
    console.log(
      `  ↓ ${relative(ROOT, file)}  ${mb(size)} → ${mb(data.length)}`,
    );
    if (DRY) continue;
    await writeFile(file, data);
  }

  if (touched === 0) {
    console.log('  nothing over the threshold.');
    return;
  }
  console.log(
    `\n${DRY ? 'Would save' : 'Saved'} ${mb(before - after)} across ${touched} file(s).`,
  );
};

// ---------------------------------------------------------------------------
// intake
// ---------------------------------------------------------------------------
const uniqueName = async (dir, base, ext) => {
  let candidate = `${base}${ext}`;
  let n = 2;
  while (existsSync(join(dir, candidate))) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }
  return candidate;
};

const projectSlugs = async () =>
  (await readdir(CONTENT)).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'));

const listLibrary = async () => {
  if (!existsSync(LIBRARY)) {
    console.log('No portfolio-photos/ folder here.');
    return;
  }
  console.log('Your originals (portfolio-photos/). Point the script at any of these:\n');
  for (const entry of (await readdir(LIBRARY, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const count = (await readdir(join(LIBRARY, entry.name))).filter((f) => !f.startsWith('.')).length;
    console.log(`  ${String(count).padStart(3)} files   "portfolio-photos/${entry.name}"`);
  }
  console.log('\nnpm run photos -- <project-slug> "portfolio-photos/<folder>"');
  console.log(`\nProjects: ${(await projectSlugs()).join(', ')}`);
};

/** Expand a user-supplied path into a list of files. Directories go one deep. */
const filesAt = async (path) => {
  const full = path.startsWith('/') ? path : join(ROOT, path);
  if (!existsSync(full)) return { full, files: null };
  const info = await stat(full);
  if (info.isFile()) return { full: dirname(full), files: [basename(full)] };
  const files = (await readdir(full)).filter((f) => !f.startsWith('.'));
  return { full, files };
};

const runIntake = async () => {
  if (!existsSync(INBOX)) {
    await mkdir(INBOX, { recursive: true });
    console.log(`Created ${relative(ROOT, INBOX)}/.`);
  }

  const slugs = await projectSlugs();
  const [slugArg, ...pathArgs] = positional;
  const jobs = [];

  if (pathArgs.length > 0) {
    // Explicit paths. These are read-only — the originals stay where they are,
    // which matters because they're usually inside portfolio-photos/.
    if (!slugArg) {
      console.log('Name the project first: npm run photos -- <project-slug> <path>…');
      console.log(`Projects: ${slugs.join(', ')}`);
      return;
    }
    for (const path of pathArgs) {
      const { full, files } = await filesAt(path);
      if (files === null) {
        console.log(`! no such path: ${path}`);
        continue;
      }
      if (files.length > 0) jobs.push({ slug: slugArg, dir: full, files, consume: false });
    }
  } else {
    const entries = await readdir(INBOX, { withFileTypes: true });
    const loose = entries.filter((e) => e.isFile() && !e.name.startsWith('.'));
    const folders = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '_done',
    );

    if (loose.length > 0) {
      if (slugArg) jobs.push({ slug: slugArg, dir: INBOX, files: loose.map((e) => e.name), consume: true });
      else {
        console.log(
          `\n${loose.length} file(s) sit loose in ${relative(ROOT, INBOX)}/ with no project.\n` +
            `  Put them in a subfolder named after a project, or run:\n` +
            `    npm run photos -- <project-slug>\n`,
        );
      }
    }
    for (const folder of folders) {
      const files = (await readdir(join(INBOX, folder.name))).filter((f) => !f.startsWith('.'));
      if (files.length > 0) {
        jobs.push({ slug: folder.name, dir: join(INBOX, folder.name), files, consume: true });
      }
    }
  }

  if (jobs.length === 0) {
    console.log(`Nothing to do. Drop files into ${relative(ROOT, INBOX)}/<project-slug>/ and run again,`);
    console.log('or point the script at a folder you already have:');
    console.log('  npm run photos -- --library');
    console.log(`\nProjects: ${slugs.join(', ')}`);
    return;
  }

  for (const job of jobs) {
    if (!slugs.includes(job.slug)) {
      console.log(`\n! "${job.slug}" is not a project. Known: ${slugs.join(', ')}`);
      console.log('  Skipped — nothing was moved or changed.');
      continue;
    }

    console.log(`\n${job.slug}  (${relative(ROOT, job.dir) || '.'})`);
    const outDir = join(IMAGES, job.slug);
    const doneDir = join(DONE, job.slug);
    if (!DRY) {
      await mkdir(outDir, { recursive: true });
      await mkdir(VIDEOS, { recursive: true });
      if (job.consume) await mkdir(doneDir, { recursive: true });
    }

    // Originals are moved aside rather than deleted. A bad crop or a wrong
    // --max is recoverable for the cost of one folder.
    const retire = async (source, name) => {
      if (!job.consume || DRY) return;
      await rename(source, join(doneDir, await uniqueName(doneDir, basename(name, extname(name)), extname(name))));
    };

    const rows = [];
    for (const name of job.files.sort()) {
      const source = join(job.dir, name);
      const ext = extname(name).toLowerCase();
      const stem = slugify(basename(name, extname(name))) || 'photo';
      let size;
      try {
        ({ size } = await stat(source));
      } catch {
        console.log(`  ! ${name} — could not read it, skipped`);
        continue;
      }

      if (VIDEO_EXT.has(ext)) {
        if (ext === '.mov') {
          console.log(`  ! ${name} — convert .mov to .mp4 first (QuickTime: File → Export As), skipped`);
          continue;
        }
        const outName = await uniqueName(VIDEOS, `${job.slug}-${stem}`, '.mp4');
        const warn = size > 5 * 1024 * 1024 ? '  ⚠ over 5 MB — commit this one on its own' : '';
        console.log(`  → public/videos/${outName}  ${mb(size)}${warn}`);
        if (!DRY) await copyFile(source, join(VIDEOS, outName));
        await retire(source, name);
        rows.push(galleryRow({ video: outName, alt: stem.replace(/-/g, ' ') }));
        continue;
      }

      if (!IMAGE_EXT.has(ext)) {
        console.log(`  · ${name} — not an image or video, left alone`);
        continue;
      }

      let encoded;
      try {
        encoded = await encode(await readFile(source), ext);
      } catch (error) {
        console.log(`  ! ${name} — ${error.message.split('\n')[0]}, left alone`);
        continue;
      }
      const outName = await uniqueName(outDir, `${job.slug}-${stem}`, encoded.ext);
      console.log(`  → ${job.slug}/${outName}  ${mb(size)} → ${mb(encoded.data.length)}`);
      if (!DRY) await writeFile(join(outDir, outName), encoded.data);
      await retire(source, name);
      rows.push(galleryRow({ image: `${job.slug}/${outName}`, alt: stem.replace(/-/g, ' ') }));
    }

    if (rows.length === 0) continue;
    if (APPEND) {
      const ok = await appendToFrontmatter(job.slug, rows);
      if (ok) console.log(`  ${DRY ? 'would add' : 'added'} ${rows.length} gallery row(s) to ${job.slug}.md`);
    } else {
      console.log('\n  Paste under `gallery:` in the frontmatter:\n');
      console.log(rows.join('\n'));
    }
  }

  console.log(
    `\nNext: set width / crop / section on the new rows in the CMS, then\n` +
      `  npm run publish -- "Add photos"`,
  );
};

if (LIST_LIBRARY) await listLibrary();
else if (SHRINK) await runShrink();
else await runIntake();
if (DRY) console.log('\n(--dry-run: nothing was written)');
