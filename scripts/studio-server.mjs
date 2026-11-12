#!/usr/bin/env node
/**
 * Studio: the write half of the live editor.  `npm run studio`
 *
 * A tiny HTTP server next to `astro dev`. The overlay injected into dev pages
 * (src/components/StudioOverlay.astro) calls it to save crop, width, section,
 * caption, order and new uploads straight into the project's frontmatter.
 * Astro's HMR then reloads the page, so the picture on screen is the real
 * rendered output rather than a preview that might disagree with it.
 *
 * Why a separate process rather than an Astro endpoint: the site is
 * output: 'static'. Writable endpoints would mean adding an SSR adapter and
 * carrying that into the production build, for a feature that must never exist
 * in production. A dev-only sidecar costs nothing on the deployed site.
 *
 * It binds 127.0.0.1 and refuses requests whose Origin isn't the local dev
 * server: it writes to the repo, so it should be reachable from one page and
 * nothing else.
 */

import { createServer } from 'node:http';
import { writeFile, readFile, mkdir, unlink, utimes, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  encode,
  convertVideo,
  hasVideoConverter,
  slugify,
  uniqueName,
  projectSlugs,
  IMAGE_EXT,
  VIDEO_EXT,
  mb,
} from './lib/media.mjs';
import { readHome, writeHome, setPath, getPath } from './lib/homejson.mjs';
import { cleanupDisplaced } from './lib/orphans.mjs';
import { loadPrefixes, parseInboxName } from './lib/prefixes.mjs';
import * as journal from './lib/journal.mjs';
import {
  readProject,
  writeProject,
  patchGalleryItem,
  appendGalleryItem,
  removeGalleryItem,
  moveGalleryItem,
  patchTopLevel,
} from './lib/frontmatter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'src/content/projects');
const IMAGES = join(ROOT, 'src/assets/images/projects');
const VIDEOS = join(ROOT, 'public/videos');
const LIBRARY = join(ROOT, 'portfolio-photos');
// Intake queue for new photos, named PREFIX_title.ext (see photo-prefixes.json).
const INBOX = join(ROOT, 'photo-inbox');
const HOME_JSON = join(ROOT, 'src/data/home.json');
const SITE_JSON = join(ROOT, 'src/data/site.json');
const HOME_IMAGES = join(ROOT, 'src/assets/images/home');
const THUMBS = join(ROOT, '.astro/studio-thumbs');

const PORT = Number(process.env.STUDIO_PORT || 4322);
const DEV_ORIGINS = new Set([
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  `http://localhost:${PORT}`,
]);
const MAX_BODY = 200 * 1024 * 1024;

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (error) {
        reject(new Error(`bad JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });

/** Astro's image() wants paths relative to the markdown file. */
const astroPath = (slug, filename) => `../../assets/images/projects/${slug}/${filename}`;

/**
 * Forces Astro to re-sync content after a write.
 *
 * Normally it doesn't need to: Astro picks up markdown changed by another
 * process on its own. But when Vite restarts mid-session — which it does the
 * moment package.json or astro.config.mjs is touched — the content watcher does
 * not come back, and from then on every save returns ok while the page keeps
 * rendering the previous frontmatter. That failure is silent and looks exactly
 * like the editor being broken.
 *
 * Touching src/content.config.ts forces the re-sync even in that state, so it
 * runs after every write rather than trying to detect the bad one. The cost is
 * a page reload the editor was going to do anyway for uploads, reorders and
 * section moves; for a crop drag the new framing is already on screen locally,
 * so the reload only confirms it.
 *
 * Debounced, so a burst of uploads reloads once rather than once per file.
 */
const CONTENT_CONFIG = join(ROOT, 'src/content.config.ts');
let nudgeTimer;
const nudgeAstro = () => {
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    const now = new Date();
    utimes(CONTENT_CONFIG, now, now).catch(() => {});
  }, 250);
};

const withProject = async (slug, mutate) => {
  const slugs = await projectSlugs(CONTENT);
  if (!slugs.includes(slug)) throw new Error(`unknown project "${slug}"`);
  const file = await readProject(CONTENT, slug);
  const result = await mutate(file);
  await writeProject(file);
  nudgeAstro();
  return result ?? {};
};

// ---------------------------------------------------------------------------
// upload: same pipeline as `npm run photos`, so a photo dropped on the page and
// a photo run through the terminal land identical.
// ---------------------------------------------------------------------------
const handleUpload = async ({ slug, filename, data, section, width }) => {
  const ext = extname(filename || '').toLowerCase();
  const stem = slugify(basename(filename || 'photo', ext)) || 'photo';
  const input = Buffer.from(data, 'base64');

  if (VIDEO_EXT.has(ext)) {
    await mkdir(VIDEOS, { recursive: true });
    const outName = await uniqueName(VIDEOS, `${slug}-${stem}`, '.mp4');
    const target = join(VIDEOS, outName);

    if (ext === '.mov') {
      if (!hasVideoConverter()) throw new Error('.mov needs /usr/bin/avconvert, which is missing');
      const scratch = join(tmpdir(), `studio-${Date.now()}.mov`);
      await writeFile(scratch, input);
      try {
        await convertVideo(scratch, target);
      } finally {
        await unlink(scratch).catch(() => {});
      }
    } else {
      await writeFile(target, input);
    }

    const row = { video: outName, alt: stem.replace(/-/g, ' '), section, width };
    const index = await withProject(slug, (file) => appendGalleryItem(file.doc, row));
    return { index, kind: 'video', file: `public/videos/${outName}`, bytes: input.length };
  }

  if (!IMAGE_EXT.has(ext)) throw new Error(`${ext || 'that file'} isn't an image or a video`);

  const outDir = join(IMAGES, slug);
  await mkdir(outDir, { recursive: true });
  const encoded = await encode(input, ext);
  const outName = await uniqueName(outDir, `${slug}-${stem}`, encoded.ext);
  await writeFile(join(outDir, outName), encoded.data);

  const row = { image: astroPath(slug, outName), alt: stem.replace(/-/g, ' '), section, width };
  const index = await withProject(slug, (file) => appendGalleryItem(file.doc, row));
  return {
    index,
    kind: 'image',
    file: `src/assets/images/projects/${slug}/${outName}`,
    before: input.length,
    after: encoded.data.length,
    saved: mb(input.length - encoded.data.length),
  };
};


// ---------------------------------------------------------------------------
// Library: browse portfolio-photos/ from the page.
//
// Read-only. The library is Ryan's 262 MB folder of originals, organised his
// way and gitignored; picking from it COPIES through the same encode pipeline
// as everything else. Nothing in there is renamed, moved or deleted.
// ---------------------------------------------------------------------------

const LIBRARY_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

/**
 * Two sources feed the picker:
 *
 *   library — portfolio-photos/, Ryan's local archive of originals. Read-only;
 *             picking COPIES through encode() into the project folder.
 *   site    — media already committed: src/assets/images/ and public/videos/.
 *             Picking only adds a gallery row pointing at the existing file.
 *             No copy, no re-encode, no second version of the same photo — this
 *             is how a CMS upload that landed in src/assets/images/11/9/ gets
 *             used without being duplicated.
 */
const SOURCES = {
  library: { root: LIBRARY, label: 'portfolio-photos/' },
  site: { root: join(ROOT, 'src/assets/images'), label: 'src/assets/images/' },
  videos: { root: VIDEOS, label: 'public/videos/' },
  inbox: { root: INBOX, label: 'photo-inbox/' },
};

/** Sources whose files are originals: picking one COPIES it through encode(). */
const COPY_SOURCES = new Set(['library', 'inbox']);

/** Resolve inside one source, refusing anything that escapes it. */
const sourcePath = (source, folder, file) => {
  const base = SOURCES[source]?.root;
  if (!base) throw new Error(`unknown source "${source}"`);
  const full = resolve(base, folder ?? '', file ?? '');
  // Without this a folder of "../../.ssh" would read anything on disk.
  if (full !== base && !full.startsWith(base + sep)) throw new Error('outside the media folder');
  return full;
};

/** The name a library pick would produce, used to mark what's already in. */
const pickedName = (slug, file) =>
  `${slug}-${slugify(basename(file, extname(file))) || 'photo'}`;

/** Path as the project markdown must reference it. */
const siteRef = (source, folder, file) =>
  source === 'videos'
    ? file
    : `../../assets/images/${[folder, file].filter(Boolean).join('/')}`;

/** Walk a directory tree, returning [relativeFolder, [filenames]] pairs. */
const walkFolders = async (root, rel = '') => {
  const dir = join(root, rel);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  let out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      out = out.concat(await walkFolders(root, rel ? `${rel}/${entry.name}` : entry.name));
    } else if (LIBRARY_EXT.has(extname(entry.name).toLowerCase())) {
      files.push(entry.name);
    }
  }
  if (files.length > 0) out.unshift([rel, files]);
  return out;
};

const listLibrary = async (slug) => {
  // Stems this project already holds, for the "added" badge on library picks.
  const projectDir = join(IMAGES, slug ?? '');
  const existingStems = new Set(
    slug && existsSync(projectDir)
      ? (await readdir(projectDir)).map((f) => basename(f, extname(f)))
      : [],
  );

  // Paths this project's gallery already references, for the site source.
  const referenced = new Set();
  if (slug) {
    try {
      const file = await readProject(CONTENT, slug);
      const gallery = file.doc.get('gallery');
      if (gallery?.items) {
        for (const item of gallery.items) {
          const image = item.get?.('image');
          const video = item.get?.('video');
          if (image) referenced.add(String(image));
          if (video) referenced.add(String(video));
        }
      }
    } catch {
      // A project without frontmatter just gets no badges.
    }
  }

  const groups = [];
  for (const [source, { root, label }] of Object.entries(SOURCES)) {
    if (source === 'inbox') continue; // sorted by prefix instead — see listInbox
    if (!existsSync(root)) continue;
    for (const [folder, names] of await walkFolders(root)) {
      const files = [];
      for (const name of names) {
        let size = 0;
        try {
          ({ size } = await stat(join(root, folder, name)));
        } catch {
          continue;
        }
        const ref = siteRef(source, folder, name);
        files.push({
          name,
          size,
          kind: VIDEO_EXT.has(extname(name).toLowerCase()) ? 'video' : 'image',
          used:
            source === 'library'
              ? existingStems.has(pickedName(slug, name))
              : referenced.has(ref),
        });
      }
      if (files.length === 0) continue;
      groups.push({
        source,
        folder,
        label: folder || (source === 'library' ? '(loose files)' : label),
        root: label,
      });
      groups[groups.length - 1].files = files;
    }
  }
  return { groups: [...(await listInbox(slug)), ...groups] };
};

// ---------------------------------------------------------------------------
// Photo inbox, sorted by filename prefix.
//
// ABV_p-and-id.png lands in the actuated-ball-valves group, gen_ files in
// General, anything with an unknown prefix in Unsorted. Re-read on every
// library open, so a file dropped into the folder in Finder shows up the next
// time the panel opens — no restart, no rescan button.
//
// Picking from here copies, like the library: the original stays in the inbox
// with an "added" badge. `npm run photos` is what retires originals to
// _done/, and it skips anything studio already imported.
// ---------------------------------------------------------------------------

/** Loose inbox files, plus one level of the older photo-inbox/<slug>/ folders. */
const inboxEntries = async () => {
  const out = [];
  if (!existsSync(INBOX)) return out;
  const isMedia = (name) => !name.startsWith('.') && LIBRARY_EXT.has(extname(name).toLowerCase());
  for (const entry of await readdir(INBOX, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '_done') continue;
    if (entry.isFile() && isMedia(entry.name)) out.push({ folder: '', name: entry.name });
    else if (entry.isDirectory()) {
      for (const name of await readdir(join(INBOX, entry.name))) {
        if (isMedia(name)) out.push({ folder: entry.name, name });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

/** Stems already in a project's image folder, cached per call. */
const stemsIn = async (cache, slug) => {
  if (!cache.has(slug)) {
    const dir = join(IMAGES, slug);
    cache.set(
      slug,
      new Set(existsSync(dir) ? (await readdir(dir)).map((f) => basename(f, extname(f))) : []),
    );
  }
  return cache.get(slug);
};

const listInbox = async (slug) => {
  const entries = await inboxEntries();
  if (entries.length === 0) return [];
  const prefixes = await loadPrefixes(ROOT);
  const slugs = await projectSlugs(CONTENT);
  const prefixFor = new Map();
  for (const [prefix, target] of prefixes) if (target && !prefixFor.has(target)) prefixFor.set(target, prefix);

  const stemCache = new Map();
  const buckets = new Map();
  for (const { folder, name } of entries) {
    const parsed = parseInboxName(name, prefixes);
    // An old-style photo-inbox/<slug>/ folder says where it goes outright.
    const target = folder && slugs.includes(folder) ? folder : parsed.slug;
    const key = target ?? (parsed.general ? '__general' : '__unsorted');
    let size = 0;
    try {
      ({ size } = await stat(join(INBOX, folder, name)));
    } catch {
      continue;
    }
    // "added" means: picking this on the page you're on would duplicate it.
    const into = slug ?? target;
    const used = into ? (await stemsIn(stemCache, into)).has(`${into}-${parsed.title}`) : false;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({
      name,
      folder,
      size,
      used,
      kind: VIDEO_EXT.has(extname(name).toLowerCase()) ? 'video' : 'image',
    });
  }

  const tag = (target) => (prefixFor.get(target) ?? '').toUpperCase();
  const labelFor = (key) => {
    if (key === '__general') return 'General · gen_';
    if (key === '__unsorted') return 'Unsorted · unknown prefix';
    const prefix = tag(key);
    return `${key === slug ? 'This project' : key.replace(/-/g, ' ')}${prefix ? ` · ${prefix}_` : ''}`;
  };
  const order = [
    slug,
    '__general',
    ...[...buckets.keys()].filter((k) => k !== slug && !k.startsWith('__')).sort(),
    '__unsorted',
  ];
  return order
    .filter((key) => key && buckets.has(key))
    .map((key) => ({
      source: 'inbox',
      folder: '',
      label: labelFor(key),
      root: 'photo-inbox/',
      current: key === slug,
      files: buckets.get(key),
    }));
};

/**
 * Point a project's hero at a new image and tidy up what it replaced.
 *
 * The old crop and zoom were chosen for a different photo, so they reset to
 * centre and 1x. The old alt is handed back so the editor can prompt for a new
 * one — a stale alt is invisible on screen, so nothing else would catch it.
 */
const setProjectHero = async (slug, ref) => {
  let before = null;
  let staleAlt = '';
  await withProject(slug, (file) => {
    before = String(file.doc.get('hero') ?? '') || null;
    staleAlt = String(file.doc.get('heroAlt') ?? '');
    file.doc.set('hero', ref);
    file.doc.delete('heroFocalPoint');
    file.doc.delete('heroZoom');
  });
  const displaced = before === ref ? null : await cleanupDisplaced(ROOT, before);
  return { hero: true, staleAlt, ...(displaced ? { displaced } : {}) };
};

/** Encode an image into a project's folder; returns the new filename. */
const importProjectImage = async (slug, input, ext, title) => {
  const outDir = join(IMAGES, slug);
  await mkdir(outDir, { recursive: true });
  const encoded = await encode(input, ext);
  const outName = await uniqueName(outDir, `${slug}-${title}`, encoded.ext);
  await writeFile(join(outDir, outName), encoded.data);
  return { outName, before: input.length, after: encoded.data.length };
};

/**
 * Move, add or remove a callout marker on a walkthrough figure.
 *
 * `callout` is 1-based, matching the number drawn on the marker. x and y are
 * percentages of the frame, clamped and rounded to a tenth — finer than that
 * is noise from the pointer, and it keeps the frontmatter readable.
 */
const figureCallout = ({ slug, figure, callout, x, y, add, remove }) =>
  withProject(slug, (file) => {
    const fig = file.doc.getIn(['figures', figure]);
    if (!fig) throw new Error(`no figure ${figure}`);
    const pct = (v) => Math.round(Math.min(100, Math.max(0, Number(v))) * 10) / 10;
    if (add) {
      const node = file.doc.createNode({ x: pct(x ?? 50), y: pct(y ?? 50), label: 'New marker', place: 'right' }, { flow: true });
      if (file.doc.getIn(['figures', figure, 'callouts'])) file.doc.addIn(['figures', figure, 'callouts'], node);
      else file.doc.setIn(['figures', figure, 'callouts'], file.doc.createNode([node]));
      return { added: true };
    }
    const i = Number(callout) - 1;
    if (!file.doc.getIn(['figures', figure, 'callouts', i])) throw new Error(`no marker ${callout} on figure ${figure + 1}`);
    if (remove) {
      file.doc.deleteIn(['figures', figure, 'callouts', i]);
      return { removed: true };
    }
    file.doc.setIn(['figures', figure, 'callouts', i, 'x'], pct(x));
    file.doc.setIn(['figures', figure, 'callouts', i, 'y'], pct(y));
    return { x: pct(x), y: pct(y) };
  });

/**
 * Put an image into a walkthrough figure: its main picture, or the "after"
 * side of a before/after (`slot: 'compare'`). A placeholder with an image
 * stops being a placeholder, so this is also how a "to make" frame gets filled.
 * The old crop belonged to the old picture, so it resets.
 */
const setFigureImage = async (slug, figure, ref, slot = 'image') => {
  if (!['image', 'compare'].includes(slot)) throw new Error(`can't set ${slot} on a figure`);
  let before = null;
  await withProject(slug, (file) => {
    if (!file.doc.getIn(['figures', figure])) throw new Error(`no figure ${figure + 1}`);
    before = String(file.doc.getIn(['figures', figure, slot]) ?? '') || null;
    file.doc.setIn(['figures', figure, slot], ref);
    if (slot === 'image') {
      file.doc.deleteIn(['figures', figure, 'focal']);
      file.doc.deleteIn(['figures', figure, 'zoom']);
    }
  });
  const displaced = before === ref ? null : await cleanupDisplaced(ROOT, before);
  return { figure, slot, ...(displaced ? { displaced } : {}) };
};

/** A file dropped onto a figure. */
const uploadFigure = async ({ slug, figure, slot, filename, data }) => {
  const ext = extname(filename || '').toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('figures take an image here (png, jpg, webp, heic)');
  const { title } = parseInboxName(filename || 'figure', await loadPrefixes(ROOT));
  const { outName, before, after } = await importProjectImage(slug, Buffer.from(data, 'base64'), ext, title);
  return { kind: 'image', file: outName, before, after, ...(await setFigureImage(slug, Number(figure), astroPath(slug, outName), slot)) };
};

/**
 * Remove a whole walkthrough figure. Its images go to .photo-trash (only if
 * nothing else on the site uses them), so undo can bring everything back.
 */
const deleteFigure = async ({ slug, figure }) => {
  const refs = [];
  await withProject(slug, (file) => {
    const node = file.doc.getIn(['figures', figure]);
    if (!node) throw new Error(`no figure ${figure + 1}`);
    for (const key of ['image', 'compare', 'poster']) {
      const ref = file.doc.getIn(['figures', figure, key]);
      if (ref) refs.push(String(ref));
    }
    file.doc.deleteIn(['figures', figure]);
    if (!file.doc.get('figures')?.items?.length) file.doc.delete('figures');
  });
  const displaced = [];
  for (const ref of refs) {
    const moved = await cleanupDisplaced(ROOT, ref);
    if (moved) displaced.push(moved);
  }
  return { deleted: figure, ...(displaced.length ? { displaced } : {}) };
};

/** Replace the hero with a file dropped on it. */
const uploadHero = async ({ slug, filename, data }) => {
  const ext = extname(filename || '').toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('the main photo has to be an image');
  const prefixes = await loadPrefixes(ROOT);
  const { title } = parseInboxName(filename || 'photo', prefixes);
  const { outName, before, after } = await importProjectImage(slug, Buffer.from(data, 'base64'), ext, title);
  return { kind: 'image', file: outName, before, after, ...(await setProjectHero(slug, astroPath(slug, outName))) };
};

/**
 * 240px preview, cached under .astro/ (gitignored). Keyed by size and mtime so
 * replacing a file invalidates its thumbnail.
 */
const libraryThumb = async (source, folder, file) => {
  const src = sourcePath(source, folder, file);
  const info = await stat(src);
  const key = createHash('sha1')
    .update(`${source}/${folder}/${file}/${info.size}/${info.mtimeMs}`)
    .digest('hex');
  const cached = join(THUMBS, `${key}.jpg`);
  if (existsSync(cached)) return readFile(cached);

  await mkdir(THUMBS, { recursive: true });
  const data = await sharp(src, { failOn: 'none' })
    .rotate()
    .resize({ width: 240, height: 240, fit: 'cover' })
    .jpeg({ quality: 72 })
    .toBuffer();
  await writeFile(cached, data);
  return data;
};

const pickFromLibrary = async ({ slug, source = 'library', folder, file, section, width, homePath, hero, figure, figureSlot }) => {
  const src = sourcePath(source, folder, file);
  const ext = extname(file).toLowerCase();
  // Inbox files drop their PREFIX_ — "ABV_p-and-id" becomes "p-and-id".
  const stem =
    source === 'inbox'
      ? parseInboxName(file, await loadPrefixes(ROOT)).title
      : slugify(basename(file, extname(file))) || 'photo';

  // Targeting a home-page slot: set that one field instead of adding a row.
  if (homePath) {
    if (source === 'videos') {
      const swap = await replaceHomeSlot(homePath, homeVideoRef(file));
      return { kind: 'video', file, reused: true, home: true, ...swap };
    }
    if (!COPY_SOURCES.has(source)) {
      // Already committed — point at it where it sits.
      const ref = `/src/assets/images/${[folder, file].filter(Boolean).join('/')}`;
      const swap = await replaceHomeSlot(homePath, ref);
      return { kind: 'image', file, reused: true, home: true, ...swap };
    }
    await mkdir(HOME_IMAGES, { recursive: true });
    const input = await readFile(src);
    const encoded = await encode(input, ext);
    const outName = await uniqueName(HOME_IMAGES, stem, encoded.ext);
    await writeFile(join(HOME_IMAGES, outName), encoded.data);
    const swap = await replaceHomeSlot(homePath, homeRef(outName));
    return { kind: 'image', file: outName, before: input.length, after: encoded.data.length, home: true, ...swap };
  }

  // Targeting a walkthrough figure: fill that frame instead of adding a row.
  if (figure !== undefined && figure !== null) {
    if (source === 'videos' || VIDEO_EXT.has(ext)) throw new Error('figures take an image here');
    const idx = Number(figure);
    if (!COPY_SOURCES.has(source)) {
      return { kind: 'image', file, reused: true, ...(await setFigureImage(slug, idx, siteRef(source, folder, file), figureSlot)) };
    }
    const { outName, before, after } = await importProjectImage(slug, await readFile(src), ext, stem);
    return { kind: 'image', file: outName, before, after, ...(await setFigureImage(slug, idx, astroPath(slug, outName), figureSlot)) };
  }

  // Targeting the project's main photo: set `hero` instead of adding a row.
  if (hero) {
    if (source === 'videos' || VIDEO_EXT.has(ext)) throw new Error('the main photo has to be an image');
    if (!COPY_SOURCES.has(source)) {
      return { kind: 'image', file, reused: true, ...(await setProjectHero(slug, siteRef(source, folder, file))) };
    }
    const { outName, before, after } = await importProjectImage(slug, await readFile(src), ext, stem);
    return { kind: 'image', file: outName, before, after, ...(await setProjectHero(slug, astroPath(slug, outName))) };
  }

  // Already committed — just reference it. Copying would duplicate the bytes
  // and leave two paths to keep in step.
  if (!COPY_SOURCES.has(source)) {
    const alt = stem.replace(/-/g, ' ');
    const row =
      source === 'videos'
        ? { video: file, alt, section, width }
        : { image: siteRef(source, folder, file), alt, section, width };
    const index = await withProject(slug, (f) => appendGalleryItem(f.doc, row));
    return { index, kind: source === 'videos' ? 'video' : 'image', file, reused: true };
  }

  if (VIDEO_EXT.has(ext)) {
    await mkdir(VIDEOS, { recursive: true });
    const outName = await uniqueName(VIDEOS, `${slug}-${stem}`, '.mp4');
    const target = join(VIDEOS, outName);
    if (ext === '.mov') {
      if (!hasVideoConverter()) throw new Error('.mov needs /usr/bin/avconvert, which is missing');
      await convertVideo(src, target);
    } else {
      await writeFile(target, await readFile(src));
    }
    const { size } = await stat(target);
    const index = await withProject(slug, (f) =>
      appendGalleryItem(f.doc, { video: outName, alt: stem.replace(/-/g, ' '), section, width }),
    );
    return { index, kind: 'video', file: `public/videos/${outName}`, after: size };
  }

  const outDir = join(IMAGES, slug);
  await mkdir(outDir, { recursive: true });
  const input = await readFile(src);
  const encoded = await encode(input, ext);
  const outName = await uniqueName(outDir, `${slug}-${stem}`, encoded.ext);
  await writeFile(join(outDir, outName), encoded.data);
  const index = await withProject(slug, (f) =>
    appendGalleryItem(f.doc, {
      image: astroPath(slug, outName),
      alt: stem.replace(/-/g, ' '),
      section,
      width,
    }),
  );
  return { index, kind: 'image', file: outName, before: input.length, after: encoded.data.length };
};


// ---------------------------------------------------------------------------
// Home page: src/data/home.json, a fixed set of slots rather than a list.
//
// Paths come straight from the data-tina-field attributes already in
// index.astro ("home.aboutSection.photo"), so the template needed no new
// markup for this.
// ---------------------------------------------------------------------------

/** JSON data files store the rooted form; see scripts/fix-cms-paths.mjs. */
const homeRef = (filename) => `/src/assets/images/home/${filename}`;

/**
 * index.astro feeds showcase video straight into <source src>, so the home
 * slot stores a site-absolute path. Project galleries store a bare filename and
 * the template prefixes it — two different conventions for the same kind of
 * value, so don't unify them without changing both templates.
 */
const homeVideoRef = (filename) => `/videos/${String(filename).replace(/^\/?videos\//, '')}`;

const withHome = async (mutate) => {
  const data = await readHome(HOME_JSON);
  const result = await mutate(data);
  await writeHome(HOME_JSON, data);
  nudgeAstro();
  return result ?? {};
};

const patchHome = async ({ path, value }) =>
  withHome((data) => setPath(data, path, value));

/**
 * Swap one home slot and tidy up whatever it was pointing at.
 *
 * Replacing the same slot twice used to strand the first upload in
 * src/assets/ forever — the build's pruner only cleans dist. cleanupDisplaced
 * deletes it only when nothing else references it AND git has no copy, so a
 * file that was committed deliberately is reported rather than removed.
 */
const replaceHomeSlot = async (path, value) => {
  const data = await readHome(HOME_JSON);
  const before = getPath(data, path);
  // The description belonged to the OLD photo. Hand it back so the editor can
  // prompt for a new one — a stale alt is invisible on screen and only shows up
  // to screen readers and image search, so nothing else would ever catch it.
  const altPath = homeAltPath(data, path);
  const staleAlt = altPath ? (getPath(data, altPath) ?? '') : null;

  await withHome((home) => setPath(home, path, value));
  const displaced = before === value ? null : await cleanupDisplaced(ROOT, before);
  return {
    ...(displaced ? { displaced } : {}),
    ...(altPath ? { altPath, staleAlt } : {}),
  };
};

/** Replace the photo in one home slot with an uploaded file. */
const uploadHome = async ({ path, filename, data }) => {
  const ext = extname(filename || '').toLowerCase();
  const stem = slugify(basename(filename || 'photo', ext)) || 'photo';
  const input = Buffer.from(data, 'base64');

  if (VIDEO_EXT.has(ext)) {
    // Only the showcase takes video, and it reads from public/videos.
    await mkdir(VIDEOS, { recursive: true });
    const outName = await uniqueName(VIDEOS, stem, '.mp4');
    const target = join(VIDEOS, outName);
    if (ext === '.mov') {
      if (!hasVideoConverter()) throw new Error('.mov needs /usr/bin/avconvert, which is missing');
      const scratch = join(tmpdir(), `studio-${Date.now()}.mov`);
      await writeFile(scratch, input);
      try { await convertVideo(scratch, target); } finally { await unlink(scratch).catch(() => {}); }
    } else {
      await writeFile(target, input);
    }
    const swap = await replaceHomeSlot(path, homeVideoRef(outName));
    return { kind: 'video', file: `public/videos/${outName}`, ...swap };
  }

  if (!IMAGE_EXT.has(ext)) throw new Error(`${ext || 'that file'} isn't an image or a video`);

  await mkdir(HOME_IMAGES, { recursive: true });
  const encoded = await encode(input, ext);
  const outName = await uniqueName(HOME_IMAGES, stem, encoded.ext);
  await writeFile(join(HOME_IMAGES, outName), encoded.data);
  const swap = await replaceHomeSlot(path, homeRef(outName));
  return { kind: 'image', file: outName, before: input.length, after: encoded.data.length, ...swap };
};


/**
 * Find the alt field that goes with a home image slot.
 *
 * The naming isn't consistent across sections — hero.headshot pairs with
 * hero.headshotAlt, aboutSection.photo with aboutSection.photoAlt, while
 * showcase and interest items use a sibling `alt`. Experience logos have none
 * (the template uses item.org). Rather than hardcode that table twice, try
 * both shapes and keep whichever actually exists in the data.
 */
const homeAltPath = (data, imagePath) => {
  const suffixed = `${imagePath}Alt`;
  if (getPath(data, suffixed) !== undefined) return suffixed;
  const sibling = `${imagePath.split('.').slice(0, -1).join('.')}.alt`;
  if (getPath(data, sibling) !== undefined) return sibling;
  return null;
};

/**
 * Find the crop fields that go with a home image slot.
 *
 * Same problem as the alt fields: the naming isn't consistent. aboutSection
 * already had `photoFocalPoint` next to `photo`, while showcase and interest
 * items are list rows where a sibling `focal` is the natural place. Try the
 * suffixed form first so the existing aboutSection field keeps being used
 * rather than being shadowed by a second one that means the same thing.
 */
const homeCropPaths = (data, imagePath) => {
  // List rows (showcase.items.2.image) keep a sibling focal/zoom. Fixed slots
  // get a suffixed pair next to the image: hero.headshotFocalPoint,
  // aboutSection.photoZoom. The old version stripped ".photo" before adding
  // the suffix, so the about photo's crop landed in aboutSection.focal, a
  // field the page never read, and the crop vanished on reload.
  const parent = imagePath.split('.').slice(0, -1).join('.');
  if (/\.items\.\d+\.[^.]+$/.test(imagePath)) return { focal: `${parent}.focal`, zoom: `${parent}.zoom` };
  return { focal: `${imagePath}FocalPoint`, zoom: `${imagePath}Zoom` };
};

/**
 * Crop one home slot. Both fields are optional in home.json — a tile that has
 * never been cropped has no keys at all — so these are created on first write.
 */
const homeCrop = async ({ imagePath, focal, zoom }) => {
  const data = await readHome(HOME_JSON);
  if (getPath(data, imagePath) === undefined) throw new Error(`no such slot: ${imagePath}`);
  const paths = homeCropPaths(data, imagePath);
  await withHome((home) => {
    if (focal !== undefined) setPath(home, paths.focal, focal, { create: true });
    if (zoom !== undefined) {
      const n = Math.min(4, Math.max(1, Number(zoom) || 1));
      // 1 is the default; storing it would put a no-op key in every tile.
      setPath(home, paths.zoom, n > 1.001 ? Number(n.toFixed(2)) : null, { create: true });
    }
  });
  return { ...paths, focal, zoom };
};

/**
 * List operations on home.json arrays (showcase tiles, interests, experience).
 *
 * Generic over the list path rather than hardcoded to the showcase: the same
 * three operations are wanted on every list on the page, and a second copy of
 * this with "interestsSection" substituted in would be the kind of duplication
 * that drifts.
 */
const homeList = async (listPath) => {
  const data = await readHome(HOME_JSON);
  const list = getPath(data, listPath);
  if (!Array.isArray(list)) throw new Error(`${listPath} is not a list`);
  return { data, list };
};

const homeMove = async ({ listPath = 'showcase.items', from, to }) => {
  const { list } = await homeList(listPath);
  const a = Number(from);
  const b = Math.min(list.length - 1, Math.max(0, Number(to)));
  if (!Number.isInteger(a) || a < 0 || a >= list.length) throw new Error(`no item at ${from}`);
  if (a === b) return { moved: false };
  await withHome((home) => {
    const items = getPath(home, listPath);
    items.splice(b, 0, ...items.splice(a, 1));
  });
  return { moved: true, from: a, to: b };
};

const homeRemove = async ({ listPath = 'showcase.items', index }) => {
  const { list } = await homeList(listPath);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new Error(`no item at ${index}`);
  const before = list[i]?.image ?? list[i]?.video ?? null;
  await withHome((home) => {
    getPath(home, listPath).splice(i, 1);
  });
  // Same rule as a gallery row: only tidy up a file nothing else points at.
  const displaced = await cleanupDisplaced(ROOT, before);
  return { removed: i, ...(displaced ? { displaced } : {}) };
};

/**
 * Add a tile. It is created empty-but-valid rather than prompting for a photo
 * first, so the new cell is on the page and can be filled by dropping onto it
 * like any other slot.
 */
const homeAdd = async ({ listPath = 'showcase.items', after, template }) => {
  const { list } = await homeList(listPath);
  // Shape per list: a row missing the keys its template reads renders blank
  // and, worse, can't be filled in from the page afterwards.
  const BLANKS = {
    'showcase.items': { image: '', alt: '', size: 'regular' },
    'interestsSection.items': { title: 'New interest', image: '', alt: '', body: '' },
    'experienceSection.items': { role: 'New role', org: '', blurb: '', logo: '' },
  };
  const blank = template ?? BLANKS[listPath];
  if (!blank) throw new Error(`don't know what a new ${listPath} row looks like`);
  const at = Number.isInteger(Number(after)) ? Math.min(list.length, Number(after) + 1) : list.length;
  await withHome((home) => {
    getPath(home, listPath).splice(at, 0, blank);
  });
  return { index: at };
};

/**
 * Site-wide theme settings (src/data/site.json).
 *
 * Fields are created on write: accentSoft, cornerStyle and headingFont don't
 * exist in a site.json written before the theme panel did, and BaseLayout
 * falls through to global.css for anything absent.
 */
const siteTheme = async ({ patch }) => {
  if (!patch || typeof patch !== 'object') throw new Error('nothing to set');
  const data = JSON.parse(await readFile(SITE_JSON, 'utf8'));
  for (const [key, value] of Object.entries(patch)) {
    if (!/^[a-zA-Z]+$/.test(key)) throw new Error(`bad setting name: ${key}`);
    if (value === null || value === '') delete data[key];
    else data[key] = value;
  }
  await writeFile(SITE_JSON, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  nudgeAstro();
  return { site: data };
};

const siteRead = async () => ({ site: JSON.parse(await readFile(SITE_JSON, 'utf8')) });

/**
 * Read the raw value behind a rendered field.
 *
 * The page shows "I bridge gaps…" with bridge italicised; home.json holds
 * "I *bridge* gaps…". Editing what's on screen would silently eat the
 * asterisks, so the editor seeds itself from the source rather than from
 * textContent, and only offers in-place editing when the two agree.
 */
const homeValue = async ({ path }) => {
  const data = await readHome(HOME_JSON);
  const value = getPath(data, path);
  if (value === undefined) throw new Error(`no such field: ${path}`);
  if (typeof value === 'object') throw new Error(`${path} is not text`);
  return { path, value: value ?? '' };
};

/** Same, for a project's frontmatter. */
const projectValue = async ({ slug, path }) => {
  const file = await readProject(CONTENT, slug);
  const value = file.doc.getIn(String(path).split('.'));
  if (value === undefined || value === null) return { path, value: '' };
  if (typeof value === 'object') throw new Error(`${path} is not text`);
  return { path, value: String(value) };
};

/** Read or write the description for a home slot. */
const homeAlt = async ({ imagePath, value }) => {
  const data = await readHome(HOME_JSON);
  const path = homeAltPath(data, imagePath);
  if (!path) throw new Error(`${imagePath} has no description field`);
  if (value === undefined) return { path, value: getPath(data, path) ?? '' };
  await withHome((home) => setPath(home, path, value));
  return { path, value };
};

/** What the undo button says it will undo. */
const undoLabel = (pathname, payload = {}) => {
  const patch = payload.patch ?? {};
  const keys = Object.keys(patch);
  switch (pathname) {
    case '/gallery/patch':
      if (keys.length === 1 && keys[0] === 'focal') return 'crop';
      if (keys.length === 1 && keys[0] === 'zoom') return 'zoom';
      if (keys.length === 1 && keys[0] === 'width') return `width ${patch.width}`;
      if (keys.length === 1 && keys[0] === 'aspect') return 'shape';
      if (keys.length === 1 && keys[0] === 'section') return 'section';
      if (keys.length === 1 && keys[0] === 'alt') return 'description';
      return keys.length ? keys.join(' + ') : 'edit';
    case '/gallery/delete': return 'remove photo';
    case '/gallery/move': return 'reorder';
    case '/project/patch':
      if (keys.length === 1 && keys[0] === 'heroFocalPoint') return 'main photo crop';
      if (keys.length === 1 && keys[0] === 'heroZoom') return 'main photo zoom';
      if (keys.length === 1 && keys[0] === 'heroAspect') return 'main photo shape';
      if (keys.length === 1 && keys[0] === 'heroAlt') return 'main photo description';
      return keys.length === 1 ? keys[0] : 'page settings';
    case '/project/hero': return 'main photo';
    case '/figure/upload': return `photo into figure ${Number(payload.figure) + 1}`;
    case '/figure/delete': return `delete figure ${Number(payload.figure) + 1}`;
    case '/figure/callout': return payload.add ? 'add marker' : payload.remove ? 'remove marker' : `move marker ${payload.callout ?? ''}`.trim();
    case '/upload': return `add ${payload.filename ?? 'file'}`;
    case '/library/pick': return payload.hero ? 'main photo' : payload.figure != null ? `photo into figure ${Number(payload.figure) + 1}` : `add ${payload.file ?? 'file'}`;
    case '/home/patch': return `home ${String(payload.path ?? '').split('.').pop()}`;
    case '/home/upload': return 'home photo';
    case '/home/alt': return 'home description';
    case '/home/crop': return payload.zoom !== undefined && payload.focal === undefined ? 'home zoom' : 'home crop';
    case '/home/move': return 'reorder tiles';
    case '/home/add': return 'add tile';
    case '/home/remove': return 'remove tile';
    case '/text/patch': return 'text';
    case '/publish': return 'publish';
    case '/site/theme': return 'theme';
    default: return pathname.replace(/^\//, '');
  }
};

// ---------------------------------------------------------------------------
// Publish: run scripts/publish.sh from the page.
//
// One job at a time, output accumulated and polled rather than streamed —
// EventSource can't set headers, and the Origin check is the only thing
// standing between this server and anything else on the machine.
//
// The script is the same one `npm run publish` runs, so the terminal and the
// button can't drift. STUDIO_PUBLISH_CMD overrides it for testing without
// pushing anything.
// ---------------------------------------------------------------------------
let job = null;

const startPublish = ({ message }) => {
  if (job && job.running) throw new Error('a publish is already running');

  const note = String(message ?? '').trim() || 'Content update';
  // The message reaches git as a single argv entry, never a shell string, so
  // quotes and newlines in it are data rather than something to escape.
  const override = process.env.STUDIO_PUBLISH_CMD;
  const [cmd, ...args] = override
    ? ['bash', '-lc', override]
    : ['bash', join(ROOT, 'scripts/publish.sh'), note];

  job = { running: true, lines: [], code: null, startedAt: Date.now(), message: note };
  const child = spawn(cmd, args, { cwd: ROOT, env: process.env });

  const take = (chunk) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue;
      job.lines.push(line);
      // A runaway script shouldn't grow this without bound.
      if (job.lines.length > 400) job.lines.shift();
    }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', (error) => {
    job.lines.push(`could not start: ${error.message}`);
    job.running = false;
    job.code = -1;
  });
  child.on('close', (code) => {
    job.running = false;
    job.code = code;
  });

  return { started: true, message: note };
};

const publishStatus = () =>
  job
    ? {
        running: job.running,
        code: job.code,
        lines: job.lines.slice(-40),
        seconds: Math.round((Date.now() - job.startedAt) / 1000),
        message: job.message,
      }
    : { running: false, code: null, lines: [], idle: true };

// ---------------------------------------------------------------------------
// Save: a local checkpoint. `git add -A && git commit`, never a push.
//
// The live site only changes when main is pushed, and the hourly auto-sync
// pushes main whenever it is ahead of GitHub — so a save made ON main would go
// live within the hour. Save therefore refuses on main: checkpoints belong on
// a working branch, and reaching the site stays a separate, deliberate step.
//
// --no-verify skips the pre-commit build. A checkpoint should take a second,
// not a minute, and a half-finished page is exactly what it exists to keep;
// publish.sh builds before anything leaves the machine.
// ---------------------------------------------------------------------------
const git = (args) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: ROOT });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolvePromise(out) : reject(new Error(err.trim() || `git ${args[0]} failed`)));
  });

// Plain-English name for a changed path, for the Save panel.
const describePath = (path) => {
  let m;
  if ((m = path.match(/^src\/content\/projects\/(.+)\.md$/))) return { area: 'Project', name: m[1].replace(/-/g, ' ') };
  if (path === 'src/data/home.json') return { area: 'Home page', name: 'text, photos and crops' };
  if (path === 'src/data/site.json') return { area: 'Theme', name: 'colours, corners, type' };
  if (path === 'src/data/navigation.json') return { area: 'Navigation', name: 'menu' };
  if ((m = path.match(/^src\/assets\/images\/(?:projects\/)?([^/]+)\/(.+)$/))) return { area: 'Photo', name: `${m[1]} / ${m[2]}` };
  if ((m = path.match(/^public\/videos\/(.+)$/))) return { area: 'Video', name: m[1] };
  return { area: 'File', name: path };
};

const STATUS_WORD = { M: 'changed', A: 'added', D: 'removed', R: 'renamed', '?': 'added' };

const saveStatus = async () => {
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const porcelain = await git(['status', '--porcelain', '--untracked-files=all']);
  const changes = porcelain
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2).trim()[0] ?? 'M';
      const path = line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop();
      return { path, status: STATUS_WORD[code] ?? 'changed', ...describePath(path) };
    });
  // Saves that are on this machine and not on the live site.
  let notLive = 0;
  try {
    notLive = Number((await git(['rev-list', '--count', 'origin/main..HEAD'])).trim()) || 0;
  } catch { /* no origin/main fetched yet */ }
  const log = await git(['log', '-8', '--format=%h%x09%cr%x09%s']);
  const saves = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, when, ...subject] = line.split('\t');
      return { hash, when, subject: subject.join('\t') };
    });
  return {
    branch,
    onMain: branch === 'main',
    changes,
    notLive,
    saves,
  };
};

const saveLocal = async ({ message }) => {
  const status = await saveStatus();
  if (status.onMain) {
    throw new Error("you're on main, where a save would go live within the hour (auto-sync). Switch to a working branch first.");
  }
  if (!status.changes.length) throw new Error('nothing new to save');
  const note = String(message ?? '').trim()
    || `Save: ${[...new Set(status.changes.map((c) => (c.area === 'Project' ? c.name : c.area)))].slice(0, 4).join(', ')}`;
  await git(['add', '-A']);
  // Message as one argv entry, so quotes and newlines are data.
  await git(['commit', '--no-verify', '-q', '-m', note]);
  return { saved: true, message: note, count: status.changes.length };
};

// Reads that happen to be POSTs (they take a body); nothing to undo.
const NOT_JOURNALLED = new Set(['/publish', '/save', '/home/value', '/project/value', '/site/read']);

const ROUTES = {
  '/gallery/patch': ({ slug, index, patch }) =>
    withProject(slug, (file) => patchGalleryItem(file.doc, index, patch)),
  '/gallery/delete': async ({ slug, index }) => {
    // Grab what the row pointed at before it's gone, then tidy up after.
    let before = null;
    await withProject(slug, (file) => {
      const item = file.doc.get('gallery')?.get(index);
      before = String(item?.get?.('image') ?? item?.get?.('video') ?? '') || null;
      removeGalleryItem(file.doc, index);
    });
    const displaced = await cleanupDisplaced(ROOT, before);
    return displaced ? { displaced } : {};
  },
  '/gallery/move': ({ slug, from, to }) =>
    withProject(slug, (file) => moveGalleryItem(file.doc, from, to)),
  '/project/patch': ({ slug, patch }) => {
    // patchTopLevel treats '' as "delete the key". For these the schema says
    // required, so a blanked field would be a build error, not a cleared one.
    for (const key of ['title', 'summary', 'hero', 'heroAlt', 'date']) {
      if (key in (patch ?? {}) && (patch[key] === '' || patch[key] == null)) {
        throw new Error(`${key} can't be empty`);
      }
    }
    return withProject(slug, (file) => patchTopLevel(file.doc, patch));
  },
  '/upload': handleUpload,
  '/project/hero': uploadHero,
  '/figure/callout': figureCallout,
  '/figure/upload': uploadFigure,
  '/figure/delete': deleteFigure,
  '/library/pick': pickFromLibrary,
  '/home/patch': patchHome,
  '/home/upload': uploadHome,
  '/home/alt': homeAlt,
  '/home/crop': homeCrop,
  '/home/move': homeMove,
  '/home/remove': homeRemove,
  '/home/add': homeAdd,
  '/site/theme': siteTheme,
  '/site/read': siteRead,
  '/home/value': homeValue,
  '/project/value': projectValue,
  '/publish': startPublish,
  '/save': saveLocal,
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && DEV_ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      projects: await projectSlugs(CONTENT),
      video: hasVideoConverter(),
      library: existsSync(LIBRARY),
      undo: journal.state(),
      trash: await journal.trashSize(ROOT),
    });
    return;
  }

  if (url.pathname === '/undo' && req.method === 'POST') {
    if (!origin || !DEV_ORIGINS.has(origin)) {
      json(res, 403, { error: 'studio only accepts requests from the local dev server' });
      return;
    }
    const result = await journal.undo(ROOT);
    if (result.ok) nudgeAstro();
    json(res, result.ok ? 200 : 409, result);
    return;
  }

  if (url.pathname === '/save/status') {
    try {
      json(res, 200, { ok: true, ...(await saveStatus()) });
    } catch (error) {
      json(res, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/publish/status') {
    json(res, 200, { ok: true, ...publishStatus() });
    return;
  }

  if (url.pathname === '/library') {
    try {
      json(res, 200, { ok: true, ...(await listLibrary(url.searchParams.get('slug'))) });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/library/thumb') {
    try {
      const data = await libraryThumb(
        url.searchParams.get('source') ?? 'library',
        url.searchParams.get('folder') ?? '',
        url.searchParams.get('file') ?? '',
      );
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': data.length,
        // Keyed by size+mtime on disk, so a long cache is safe.
        'cache-control': 'max-age=3600',
      });
      res.end(data);
    } catch (error) {
      // A tile that can't be previewed still has to render, so answer with a
      // status the grid can show rather than a broken image.
      json(res, 415, { error: error.message });
    }
    return;
  }

  const route = ROUTES[url.pathname];
  if (!route || req.method !== 'POST') {
    json(res, 404, { error: 'no such endpoint' });
    return;
  }

  // Writes touch the repo, so only the dev page may call them.
  if (!origin || !DEV_ORIGINS.has(origin)) {
    json(res, 403, { error: 'studio only accepts requests from the local dev server' });
    return;
  }

  try {
    const payload = await readBody(req);
    // Snapshot before, compare after: the journal works out for itself what
    // the route changed, so a new endpoint is undoable without being told.
    // Publishing isn't an edit — it commits and pushes what is already saved,
    // so there is nothing meaningful for an undo to restore, and journalling
    // it would bury the last real edit under an entry that can't be reversed.
    const journalled = !NOT_JOURNALLED.has(url.pathname);
    if (journalled) await journal.begin(ROOT, undoLabel(url.pathname, payload));
    const result = await route(payload);
    if (journalled) await journal.commit(ROOT);
    json(res, 200, { ok: true, ...result, undo: journal.state() });
  } catch (error) {
    journal.abort();
    console.error(`studio: ${url.pathname} — ${error.message}`);
    json(res, 400, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`studio: writing to ${ROOT.replace(process.env.HOME ?? '', '~')}`);
  console.log(`studio: listening on http://127.0.0.1:${PORT}`);
  if (!hasVideoConverter()) console.log('studio: no /usr/bin/avconvert — .mov uploads will be refused');
});
