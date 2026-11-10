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
const HOME_JSON = join(ROOT, 'src/data/home.json');
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
};

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
  return { groups };
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

const pickFromLibrary = async ({ slug, source = 'library', folder, file, section, width, homePath }) => {
  const src = sourcePath(source, folder, file);
  const ext = extname(file).toLowerCase();
  const stem = slugify(basename(file, extname(file))) || 'photo';

  // Targeting a home-page slot: set that one field instead of adding a row.
  if (homePath) {
    if (source === 'videos') {
      const swap = await replaceHomeSlot(homePath, homeVideoRef(file));
      return { kind: 'video', file, reused: true, home: true, ...swap };
    }
    if (source !== 'library') {
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

  // Already committed — just reference it. Copying would duplicate the bytes
  // and leave two paths to keep in step.
  if (source !== 'library') {
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
  const stem = imagePath.replace(/\.(image|photo|video)$/, '');
  const parent = imagePath.split('.').slice(0, -1).join('.');
  const suffixed = `${stem}FocalPoint`;
  const focal = getPath(data, suffixed) !== undefined ? suffixed : `${parent}.focal`;
  const zoomSuffixed = `${stem}Zoom`;
  const zoom = getPath(data, zoomSuffixed) !== undefined ? zoomSuffixed : `${parent}.zoom`;
  return { focal, zoom };
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
    case '/project/patch': return 'page settings';
    case '/upload': return `add ${payload.filename ?? 'file'}`;
    case '/library/pick': return `add ${payload.file ?? 'file'}`;
    case '/home/patch': return `home ${String(payload.path ?? '').split('.').pop()}`;
    case '/home/upload': return 'home photo';
    case '/home/alt': return 'home description';
    case '/home/crop': return payload.zoom !== undefined && payload.focal === undefined ? 'home zoom' : 'home crop';
    case '/home/move': return 'reorder tiles';
    case '/home/add': return 'add tile';
    case '/home/remove': return 'remove tile';
    case '/text/patch': return 'text';
    default: return pathname.replace(/^\//, '');
  }
};

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
  '/project/patch': ({ slug, patch }) => withProject(slug, (file) => patchTopLevel(file.doc, patch)),
  '/upload': handleUpload,
  '/library/pick': pickFromLibrary,
  '/home/patch': patchHome,
  '/home/upload': uploadHome,
  '/home/alt': homeAlt,
  '/home/crop': homeCrop,
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
    await journal.begin(ROOT, undoLabel(url.pathname, payload));
    const result = await route(payload);
    await journal.commit(ROOT);
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
