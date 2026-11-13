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
import YAML from 'yaml';
import { tmpdir } from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { fileInbox } from './lib/inbox-file.mjs';
import { review } from './lib/review.mjs';
import {
  readProject,
  writeProject,
  appendGalleryItem,
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
// Full-length originals for the experience banners. Gitignored: only the cut
// clip in public/videos ships. Kept so a banner can be re-trimmed later.
const VIDEO_SOURCES = join(ROOT, 'video-sources');

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

// No "nudge" after writes any more. Astro reloads the page by itself when a
// content file changes; touching content.config.ts on top of that made every
// edit reload TWICE. The nudge existed to rescue a dead content watcher after
// Vite restarts in-process (gotcha 15); studio.sh now restarts astro dev
// whenever package.json or the Astro config changes, which removes the cause.

const withProject = async (slug, mutate) => {
  const slugs = await projectSlugs(CONTENT);
  if (!slugs.includes(slug)) throw new Error(`unknown project "${slug}"`);
  const file = await readProject(CONTENT, slug);
  const result = await mutate(file);
  await writeProject(file);
  return result ?? {};
};

// ---------------------------------------------------------------------------
// Media: one route for every photo or video that lands on a page.
//
//   target.kind  gallery (default) | hero | figure | home
//   source       bytes ({ filename, data }) or a library pick
//                ({ source, folder, file }: inbox / library copy through
//                encode(); site / videos are already committed and are
//                referenced where they sit, never duplicated)
//
// Same encode pipeline as `npm run photos`, so a dropped photo, a picked one
// and one run through the terminal land identical.
// ---------------------------------------------------------------------------

/** Name for the new file. A known PREFIX_ (photo-prefixes.json) is dropped. */
const titleOf = async (name) => {
  const parsed = parseInboxName(name, await loadPrefixes(ROOT));
  return parsed.known ? parsed.title : slugify(basename(name, extname(name))) || 'photo';
};

/** Bytes or a file on disk -> public/videos/<name>.mp4 (.mov converted). */
const storeVideo = async (base, { input, srcPath, ext }) => {
  await mkdir(VIDEOS, { recursive: true });
  const outName = await uniqueName(VIDEOS, base, '.mp4');
  const target = join(VIDEOS, outName);
  if (ext === '.mov') {
    if (!hasVideoConverter()) throw new Error('.mov needs /usr/bin/avconvert, which is missing');
    const scratch = srcPath ?? join(tmpdir(), `studio-${Date.now()}.mov`);
    if (!srcPath) await writeFile(scratch, input);
    try { await convertVideo(scratch, target); } finally { if (!srcPath) await unlink(scratch).catch(() => {}); }
  } else {
    await writeFile(target, input ?? (await readFile(srcPath)));
  }
  return { outName, after: (await stat(target)).size };
};

const placeMedia = async ({ slug, target = {}, filename, data, source, folder, file }) => {
  const kind = target.kind ?? 'gallery';
  const home = kind === 'home';
  if (!['gallery', 'hero', 'figure', 'home'].includes(kind)) throw new Error(`unknown target "${kind}"`);
  const name = filename ?? file;
  if (!name) throw new Error('nothing to place');
  const ext = extname(name).toLowerCase();
  const isVideo = source === 'videos' || VIDEO_EXT.has(ext);
  if (!isVideo && !IMAGE_EXT.has(ext)) throw new Error(`${ext || 'that file'} isn't an image or a video`);
  if (isVideo && kind === 'hero') throw new Error('the main photo has to be an image');
  if (isVideo && kind === 'figure') throw new Error('figures take an image here');

  if (home && isVideo && BANNER_PATH.test(target.path ?? '') && !(source && !COPY_SOURCES.has(source))) {
    const srcPath = source ? sourcePath(source, folder, file) : null;
    return storeBannerSource(target.path, { input: srcPath ? null : Buffer.from(data ?? '', 'base64'), srcPath, name });
  }

  const title = await titleOf(name);
  const base = home ? title : `${slug}-${title}`;
  let ref;
  let meta;
  if (source && !COPY_SOURCES.has(source)) {
    // Already committed: point at it where it sits.
    const rel = [folder, file].filter(Boolean).join('/');
    ref = isVideo ? (home ? homeVideoRef(file) : file) : home ? `/src/assets/images/${rel}` : siteRef(source, folder, file);
    meta = { file, reused: true };
  } else {
    const srcPath = source ? sourcePath(source, folder, file) : null;
    const input = srcPath ? null : Buffer.from(data ?? '', 'base64');
    if (isVideo) {
      const { outName, after } = await storeVideo(base, { input, srcPath, ext });
      ref = home ? homeVideoRef(outName) : outName;
      meta = { file: `public/videos/${outName}`, after };
    } else {
      const bytes = input ?? (await readFile(srcPath));
      const dir = home ? HOME_IMAGES : join(IMAGES, slug);
      await mkdir(dir, { recursive: true });
      const encoded = await encode(bytes, ext);
      const outName = await uniqueName(dir, base, encoded.ext);
      await writeFile(join(dir, outName), encoded.data);
      ref = home ? homeRef(outName) : astroPath(slug, outName);
      meta = { file: outName, before: bytes.length, after: encoded.data.length };
    }
  }

  const out = { kind: isVideo ? 'video' : 'image', ...meta };
  if (home) return { ...out, home: true, ...(await replaceHomeSlot(target.path, ref)) };
  if (kind === 'hero') return { ...out, ...(await setProjectHero(slug, ref)) };
  if (kind === 'figure') return { ...out, ...(await setFigureImage(slug, Number(target.figure), ref, target.slot ?? 'image')) };
  const row = { [isVideo ? 'video' : 'image']: ref, alt: title.replace(/-/g, ' '), section: target.section, width: target.width };
  return { ...out, index: await withProject(slug, (f) => appendGalleryItem(f.doc, row)) };
};

// ---------------------------------------------------------------------------
// Lists in a project's frontmatter: gallery rows, figures, a figure's points
// and callout markers. add / remove / move, one route for all of them.
// Removing a row tidies up any media only it used (to .photo-trash, so undo
// can bring it back).
// ---------------------------------------------------------------------------
const PROJECT_LISTS = /^(gallery|figures)(\.\d+\.(points|callouts))?$/;
const MEDIA_KEYS = ['image', 'video', 'compare', 'poster'];
const toPath = (dotted) => String(dotted).split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));

const projectList = async ({ slug, path, op, index, from, to, value, at }) => {
  if (!PROJECT_LISTS.test(String(path))) throw new Error(`${path} is not an editable list`);
  const keys = toPath(path);
  const refs = [];
  const result = await withProject(slug, (file) => {
    const { doc } = file;
    let seq = doc.getIn(keys);
    if (op === 'add') {
      if (!YAML.isSeq(seq)) {
        doc.setIn(keys, doc.createNode([]));
        seq = doc.getIn(keys);
      }
      // Markers are written inline, { x: 51, y: 18, label: …, place: right },
      // like the hand-written ones.
      const node = doc.createNode(value, { flow: keys.at(-1) === 'callouts' });
      const i = at == null ? seq.items.length : Math.max(0, Math.min(seq.items.length, Number(at)));
      seq.items.splice(i, 0, node);
      return { index: i };
    }
    if (!YAML.isSeq(seq)) throw new Error(`${path} is empty`);
    if (op === 'remove') {
      const i = Number(index);
      const item = seq.get(i, true);
      if (item === undefined) throw new Error(`nothing at ${path}.${i}`);
      if (YAML.isMap(item)) for (const key of MEDIA_KEYS) if (item.get(key)) refs.push(String(item.get(key)));
      seq.delete(i);
      if (!seq.items.length && path === 'figures') doc.delete('figures');
      return { removed: i };
    }
    if (op === 'move') {
      const a = Number(from);
      const b = Math.max(0, Math.min(seq.items.length - 1, Number(to)));
      if (!seq.items[a]) throw new Error(`nothing at ${path}.${a}`);
      if (a === b) return { moved: false };
      seq.items.splice(b, 0, ...seq.items.splice(a, 1));
      return { moved: true, from: a, to: b };
    }
    throw new Error(`unknown list operation "${op}"`);
  });
  const displaced = [];
  for (const ref of refs) {
    const moved = await cleanupDisplaced(ROOT, ref);
    if (moved) displaced.push(moved);
  }
  return { ...result, ...(displaced.length ? { displaced: displaced[0], displacedAll: displaced } : {}) };
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
/**
 * Read or rewrite one body section (the markdown under a `## Heading`).
 *
 * The heading line itself never changes: Problem / What I did / Outcome is
 * the page's structure, and figures and gallery rows attach to it by name.
 * `section` is the heading's id as rendered ("what-i-did"). With no `value`
 * this is a read.
 */
const sectionBounds = (body, id) => {
  const lines = body.split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) heads.push({ i, id: slugify(m[1]) });
  });
  const at = heads.findIndex((h) => h.id === id);
  if (at === -1) throw new Error(`no "${id}" section in the body`);
  const start = heads[at].i + 1;
  const end = at + 1 < heads.length ? heads[at + 1].i : lines.length;
  return { lines, start, end };
};

const projectSection = async ({ slug, section, value }) => {
  const slugs = await projectSlugs(CONTENT);
  if (!slugs.includes(slug)) throw new Error(`unknown project "${slug}"`);
  const file = await readProject(CONTENT, slug);
  const body = file.source.slice(file.header.length);
  const { lines, start, end } = sectionBounds(body, String(section));
  if (value === undefined) return { section, value: lines.slice(start, end).join('\n').trim() };
  const text = String(value).replace(/\r\n/g, '\n').trim();
  const isLast = end === lines.length;
  const next = [...lines.slice(0, start), '', ...(text ? [text] : []), ...(isLast ? [''] : ['', '']), ...lines.slice(end)];
  // Collapse runs of blank lines the splice may have doubled.
  const out = next.join('\n').replace(/\n{3,}/g, '\n\n');
  await writeFile(file.path, file.header + out, 'utf8');
  return { section, saved: true };
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



// ---------------------------------------------------------------------------
// Home page: src/data/home.json, a fixed set of slots rather than a list.
//
// Paths come straight from the data-field attributes ("home:aboutSection.photo") in
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
 * The same list operations on home.json (showcase tiles, interests,
 * experience). A new row is created empty-but-valid, so it appears on the page
 * and can be filled by dropping onto it like any other slot.
 */
const HOME_BLANKS = {
  'showcase.items': { image: '', alt: '', size: 'regular' },
  'interestsSection.items': { title: 'New interest', image: '', alt: '', body: '' },
  'experienceSection.items': { role: 'New role', org: '', blurb: '', logo: '' },
};

const homeListOp = async ({ path = 'showcase.items', op, index, from, to, after }) => {
  const data = await readHome(HOME_JSON);
  const list = getPath(data, path);
  if (!Array.isArray(list)) throw new Error(`${path} is not a list`);
  const inRange = (n) => Number.isInteger(n) && n >= 0 && n < list.length;
  if (op === 'add') {
    const blank = HOME_BLANKS[path];
    if (!blank) throw new Error(`don't know what a new ${path} row looks like`);
    const at = Number.isInteger(Number(after)) ? Math.min(list.length, Number(after) + 1) : list.length;
    await withHome((home) => { getPath(home, path).splice(at, 0, structuredClone(blank)); });
    return { index: at };
  }
  if (op === 'remove') {
    const i = Number(index);
    if (!inRange(i)) throw new Error(`no item at ${index}`);
    const before = list[i]?.image ?? list[i]?.video ?? null;
    await withHome((home) => { getPath(home, path).splice(i, 1); });
    const displaced = await cleanupDisplaced(ROOT, before);
    return { removed: i, ...(displaced ? { displaced } : {}) };
  }
  if (op === 'move') {
    const a = Number(from);
    const b = Math.min(list.length - 1, Math.max(0, Number(to)));
    if (!inRange(a)) throw new Error(`no item at ${from}`);
    if (a === b) return { moved: false };
    await withHome((home) => { const items = getPath(home, path); items.splice(b, 0, ...items.splice(a, 1)); });
    return { moved: true, from: a, to: b };
  }
  throw new Error(`unknown list operation "${op}"`);
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
const projectValue = async ({ slug, path, json }) => {
  const file = await readProject(CONTENT, slug);
  const value = file.doc.getIn(toPath(path));
  // json: the inspector reads a whole figure at once.
  if (json) return { path, value: value?.toJSON ? value.toJSON() : value ?? null };
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
const PATCH_LABELS = {
  focal: 'crop', compareFocal: 'crop', zoom: 'zoom', compareZoom: 'zoom', aspect: 'shape',
  section: 'section', alt: 'description', heroFocalPoint: 'main photo crop',
  heroZoom: 'main photo zoom', heroAspect: 'main photo shape', heroAlt: 'main photo description',
  x: 'move marker', y: 'move marker',
};
const LIST_NOUNS = { gallery: 'photo', figures: 'figure', points: 'point', callouts: 'marker' };

const undoLabel = (pathname, payload = {}) => {
  switch (pathname) {
    case '/project/patch': {
      const keys = Object.keys(payload.patch ?? {});
      const leaves = [...new Set(keys.map((k) => k.split('.').pop()))];
      if (leaves.length === 1 && leaves[0] === 'width') return `width ${Object.values(payload.patch)[0]}`;
      if (leaves.length === 1) return PATCH_LABELS[leaves[0]] ?? leaves[0];
      if (leaves.every((l) => l === 'x' || l === 'y')) return 'move marker';
      return 'page settings';
    }
    case '/project/list': {
      const noun = LIST_NOUNS[String(payload.path).split('.').pop()] ?? 'item';
      return payload.op === 'move' ? `reorder ${noun}s` : `${payload.op} ${noun}`;
    }
    case '/project/section': return `${String(payload.section ?? 'section').replace(/-/g, ' ')} text`;
    case '/media': {
      const t = payload.target ?? {};
      if (t.kind === 'hero') return 'main photo';
      if (t.kind === 'figure') return `photo into figure ${Number(t.figure) + 1}`;
      if (t.kind === 'home') return 'home photo';
      return `add ${payload.filename ?? payload.file ?? 'file'}`;
    }
    case '/home/patch': return `home ${String(payload.path ?? '').split('.').pop()}`;
    case '/home/list': return payload.op === 'move' ? 'reorder tiles' : `${payload.op} tile`;
    case '/home/alt': return 'home description';
    case '/home/video/cut': return 'trim banner';
    case '/home/crop': return payload.zoom !== undefined && payload.focal === undefined ? 'home zoom' : 'home crop';
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
  const { moved: inbox } = await fileInbox(ROOT, { dryRun: true });
  return {
    branch,
    onMain: branch === 'main',
    inbox,
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
  // Tidy the photo inbox on every save: PREFIX_ originals move into
  // portfolio-photos/<project>/. Gitignored both sides, so it doesn't touch
  // the commit; it's here because Save is the moment Ryan says "keep this".
  const { moved } = await fileInbox(ROOT);
  if (!status.changes.length) {
    if (moved.length) return { saved: false, filed: moved, count: 0 };
    throw new Error('nothing new to save');
  }
  const note = String(message ?? '').trim()
    || `Save: ${[...new Set(status.changes.map((c) => (c.area === 'Project' ? c.name : c.area)))].slice(0, 4).join(', ')}`;
  await git(['add', '-A']);
  // Message as one argv entry, so quotes and newlines are data.
  await git(['commit', '--no-verify', '-q', '-m', note]);
  return { saved: true, message: note, count: status.changes.length, filed: moved };
};

// Reads that happen to be POSTs (they take a body); nothing to undo.

// ---------------------------------------------------------------------------
// Experience banners: trim a full-length source into a short loop.
//
// home.json experienceSection.items[i]:
//   videoSource  file in video-sources/ (full length, never shipped)
//   videoStart / videoEnd  seconds into the source
//   video        the cut clip, /videos/experience-<org>.mp4
// The trim panel previews the source on the page itself, looping between the
// two marks, and only encodes when you press Cut.
// ---------------------------------------------------------------------------

const run = promisify(execFile);
const BANNER_PATH = /^experienceSection\.items\.(\d+)\.video$/;
const MAX_BANNER_SECONDS = 40;

const sourceFile = (name) => {
  const file = basename(String(name ?? ''));
  if (!file || !VIDEO_EXT.has(extname(file).toLowerCase())) throw new Error('not a video source');
  const full = join(VIDEO_SOURCES, file);
  if (!existsSync(full)) throw new Error(`${file} isn't in video-sources/`);
  return full;
};

const listSources = async () => {
  if (!existsSync(VIDEO_SOURCES)) return [];
  const names = (await readdir(VIDEO_SOURCES)).filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()));
  return Promise.all(names.sort().map(async (file) => ({ file, size: (await stat(join(VIDEO_SOURCES, file))).size })));
};

/** Stream a source with Range support, so the browser can seek in it. */
const serveSource = async (req, res, name) => {
  const full = sourceFile(name);
  const { size } = await stat(full);
  const type = extname(full).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
  const { createReadStream } = await import('node:fs');
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (!range) {
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    createReadStream(full).pipe(res);
    return;
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.writeHead(206, {
    'content-type': type,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${size}`,
    'accept-ranges': 'bytes',
  });
  createReadStream(full, { start, end }).pipe(res);
};

/** Cut [start, end] of the source into public/videos and point the banner at it. */
const cutBanner = async ({ index, source, start, end }) => {
  if (!hasVideoConverter()) throw new Error('cutting needs /usr/bin/avconvert, which is missing');
  const i = Number(index);
  const data = await readHome(HOME_JSON);
  const item = data.experienceSection?.items?.[i];
  if (!item) throw new Error(`no experience item ${index}`);
  const file = basename(String(source ?? item.videoSource ?? ''));
  const full = sourceFile(file);
  const a = Math.max(0, Number(start));
  const b = Number(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 1) throw new Error('pick at least one second');
  if (b - a > MAX_BANNER_SECONDS) throw new Error(`keep the loop under ${MAX_BANNER_SECONDS} s`);

  await mkdir(VIDEOS, { recursive: true });
  const base = `experience-${slugify(item.org ?? `item-${i}`).slice(0, 40)}`;
  const outName = await uniqueName(VIDEOS, base, '.mp4');
  const target = join(VIDEOS, outName);
  await run('/usr/bin/avconvert', [
    '--source', full, '--output', target, '--preset', 'Preset1280x720',
    '--start', a.toFixed(2), '--duration', (b - a).toFixed(2), '--replace',
  ]);
  const before = item.video;
  await withHome((home) => {
    const row = home.experienceSection.items[i];
    row.videoSource = file;
    row.videoStart = Number(a.toFixed(2));
    row.videoEnd = Number(b.toFixed(2));
    row.video = homeVideoRef(outName);
  });
  // The previous cut of this banner is now unreferenced. Only ever our own
  // experience-* clips: anything else in public/videos was put there on purpose.
  if (before && before !== homeVideoRef(outName) && /^\/videos\/experience-[\w-]+\.mp4$/.test(before)) {
    await unlink(join(VIDEOS, basename(before))).catch(() => {});
  }
  const after = (await stat(target)).size;
  return { file: `public/videos/${outName}`, after, seconds: Number((b - a).toFixed(2)) };
};

/** Store a dropped video as a banner source; the trim prompt takes it from there. */
const storeBannerSource = async (path, { input, srcPath, name }) => {
  const i = Number(BANNER_PATH.exec(path)[1]);
  await mkdir(VIDEO_SOURCES, { recursive: true });
  const ext = extname(name).toLowerCase();
  const outName = await uniqueName(VIDEO_SOURCES, slugify(basename(name, ext)) || 'video', ext);
  await writeFile(join(VIDEO_SOURCES, outName), input ?? (await readFile(srcPath)));
  await withHome((home) => {
    const row = home.experienceSection.items[i];
    row.videoSource = outName;
    delete row.videoStart;
    delete row.videoEnd;
  });
  return { kind: 'video', file: `video-sources/${outName}`, banner: i, needsTrim: true };
};

const NOT_JOURNALLED = new Set(['/publish', '/save', '/project/section/read', '/home/value', '/project/value', '/site/read']);

const ROUTES = {
  // Projects: any field by dotted path, any list, the body sections.
  '/project/patch': ({ slug, patch }) => {
    // '' deletes a key. These are required by the schema, so a blank one
    // would be a build error rather than a cleared field.
    for (const key of ['title', 'summary', 'hero', 'heroAlt', 'date']) {
      if (key in (patch ?? {}) && (patch[key] === '' || patch[key] == null)) throw new Error(`${key} can't be empty`);
    }
    return withProject(slug, (file) => patchTopLevel(file.doc, patch));
  },
  '/project/list': projectList,
  '/project/section': projectSection,
  // Every photo or video, wherever it is going.
  '/media': placeMedia,
  // Home page (src/data/home.json) and site settings.
  '/home/patch': patchHome,
  '/home/list': homeListOp,
  '/home/crop': homeCrop,
  '/home/alt': homeAlt,
  '/home/video/cut': cutBanner,
  '/site/theme': siteTheme,
  // Reads (never journalled).
  '/project/value': projectValue,
  '/project/section/read': ({ slug, section }) => projectSection({ slug, section }),
  '/home/value': homeValue,
  '/site/read': siteRead,
  // Git.
  '/save': saveLocal,
  '/publish': startPublish,
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

  if (url.pathname === '/redo/clear' && req.method === 'POST') {
    if (!origin || !DEV_ORIGINS.has(origin)) { json(res, 403, { error: 'local dev server only' }); return; }
    await journal.clearRedo();
    json(res, 200, { ok: true, undo: journal.state() });
    return;
  }

  if ((url.pathname === '/undo' || url.pathname === '/redo') && req.method === 'POST') {
    if (!origin || !DEV_ORIGINS.has(origin)) {
      json(res, 403, { error: 'studio only accepts requests from the local dev server' });
      return;
    }
    const body = await readBody(req).catch(() => ({}));
    const result = url.pathname === '/redo'
      ? await journal.redo(ROOT)
      : await journal.undo(ROOT, Math.min(15, Number(body.steps) || 1));
    json(res, result.ok ? 200 : 409, { ...result, undo: journal.state() });
    return;
  }

  // The overlay's own code (scripts/studio/), loaded by the dev page as a
  // module. Read-only, flat directory, no path components allowed.
  if (url.pathname.startsWith('/overlay/') && req.method === 'GET') {
    const name = url.pathname.slice('/overlay/'.length);
    const type = { '.js': 'text/javascript', '.css': 'text/css' }[extname(name)];
    if (!/^[\w.-]+$/.test(name) || !type) { json(res, 404, { error: 'no such file' }); return; }
    try {
      const body = await readFile(join(ROOT, 'scripts/studio', name));
      // CORS for the module script comes from the shared header above.
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      json(res, 404, { error: 'no such file' });
    }
    return;
  }

  // Plain-English summary of what changed: since the last save, or against
  // what's on the live site.
  if (url.pathname === '/save/review') {
    try {
      const base = url.searchParams.get('base') === 'live' ? 'origin/main' : 'HEAD';
      json(res, 200, { ok: true, base, groups: await review(ROOT, base) });
    } catch (error) {
      json(res, 500, { error: error.message });
    }
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

  if (url.pathname === '/video-source') {
    try { await serveSource(req, res, url.searchParams.get('file')); } catch (error) { json(res, 404, { error: error.message }); }
    return;
  }
  if (url.pathname === '/video-sources') {
    try { json(res, 200, { ok: true, sources: await listSources(), max: MAX_BANNER_SECONDS }); } catch (error) { json(res, 400, { error: error.message }); }
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

await journal.load(ROOT);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`studio: writing to ${ROOT.replace(process.env.HOME ?? '', '~')}`);
  console.log(`studio: listening on http://127.0.0.1:${PORT}`);
  if (!hasVideoConverter()) console.log('studio: no /usr/bin/avconvert — .mov uploads will be refused');
});
