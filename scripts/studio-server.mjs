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

/** Resolve a folder/file pair inside the library, refusing anything outside. */
const libraryPath = (folder, file) => {
  const full = resolve(LIBRARY, folder ?? '', file ?? '');
  // A folder name like "../../.ssh" would otherwise read anything on disk.
  if (full !== LIBRARY && !full.startsWith(LIBRARY + sep)) throw new Error('outside the library');
  return full;
};

/** The name this file would get if picked into a project. */
const pickedName = (slug, file) =>
  `${slug}-${slugify(basename(file, extname(file))) || 'photo'}`;

const listLibrary = async (slug) => {
  if (!existsSync(LIBRARY)) return { folders: [] };

  // Which stems this project already has, so the grid can mark them.
  const projectDir = join(IMAGES, slug ?? '');
  const existing = new Set(
    slug && existsSync(projectDir)
      ? (await readdir(projectDir)).map((f) => basename(f, extname(f)))
      : [],
  );

  const entries = await readdir(LIBRARY, { withFileTypes: true });
  const folders = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const isRoot = !entry.isDirectory();
    const dir = isRoot ? LIBRARY : join(LIBRARY, entry.name);
    const folderName = isRoot ? '' : entry.name;
    if (isRoot) continue; // loose files handled below, in one pseudo-folder

    const files = [];
    for (const name of (await readdir(dir)).sort()) {
      if (name.startsWith('.')) continue;
      const ext = extname(name).toLowerCase();
      if (!LIBRARY_EXT.has(ext)) continue;
      let size = 0;
      try { ({ size } = await stat(join(dir, name))); } catch { continue; }
      files.push({
        name,
        size,
        kind: VIDEO_EXT.has(ext) ? 'video' : 'image',
        used: existing.has(pickedName(slug, name)),
      });
    }
    if (files.length > 0) folders.push({ folder: folderName, files });
  }

  // Loose files at the top level of the library.
  const loose = [];
  for (const entry of entries) {
    if (entry.isDirectory() || entry.name.startsWith('.')) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!LIBRARY_EXT.has(ext)) continue;
    let size = 0;
    try { ({ size } = await stat(join(LIBRARY, entry.name))); } catch { continue; }
    loose.push({
      name: entry.name,
      size,
      kind: VIDEO_EXT.has(ext) ? 'video' : 'image',
      used: existing.has(pickedName(slug, entry.name)),
    });
  }
  if (loose.length > 0) folders.unshift({ folder: '', files: loose.sort((a, b) => a.name.localeCompare(b.name)) });

  return { folders };
};

/**
 * 240px preview, cached under .astro/ (already gitignored). Keyed by size and
 * mtime so replacing a library file invalidates its thumbnail.
 */
const libraryThumb = async (folder, file) => {
  const source = libraryPath(folder, file);
  const info = await stat(source);
  const key = createHash('sha1')
    .update(`${folder}/${file}/${info.size}/${info.mtimeMs}`)
    .digest('hex');
  const cached = join(THUMBS, `${key}.jpg`);
  if (existsSync(cached)) return readFile(cached);

  await mkdir(THUMBS, { recursive: true });
  const data = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize({ width: 240, height: 240, fit: 'cover' })
    .jpeg({ quality: 72 })
    .toBuffer();
  await writeFile(cached, data);
  return data;
};

/** Copy one library file into a project, through the normal pipeline. */
const pickFromLibrary = async ({ slug, folder, file, section, width }) => {
  const source = libraryPath(folder, file);
  const ext = extname(file).toLowerCase();
  const stem = slugify(basename(file, extname(file))) || 'photo';

  if (VIDEO_EXT.has(ext)) {
    await mkdir(VIDEOS, { recursive: true });
    const outName = await uniqueName(VIDEOS, `${slug}-${stem}`, '.mp4');
    const target = join(VIDEOS, outName);
    if (ext === '.mov') {
      if (!hasVideoConverter()) throw new Error('.mov needs /usr/bin/avconvert, which is missing');
      await convertVideo(source, target);
    } else {
      await writeFile(target, await readFile(source));
    }
    const { size } = await stat(target);
    const index = await withProject(slug, (f) =>
      appendGalleryItem(f.doc, { video: outName, alt: stem.replace(/-/g, ' '), section, width }),
    );
    return { index, kind: 'video', file: `public/videos/${outName}`, after: size };
  }

  const outDir = join(IMAGES, slug);
  await mkdir(outDir, { recursive: true });
  const input = await readFile(source);
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

const ROUTES = {
  '/gallery/patch': ({ slug, index, patch }) =>
    withProject(slug, (file) => patchGalleryItem(file.doc, index, patch)),
  '/gallery/delete': ({ slug, index }) =>
    withProject(slug, (file) => removeGalleryItem(file.doc, index)),
  '/gallery/move': ({ slug, from, to }) =>
    withProject(slug, (file) => moveGalleryItem(file.doc, from, to)),
  '/project/patch': ({ slug, patch }) => withProject(slug, (file) => patchTopLevel(file.doc, patch)),
  '/upload': handleUpload,
  '/library/pick': pickFromLibrary,
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
    });
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
    json(res, 200, { ok: true, ...(await route(payload)) });
  } catch (error) {
    console.error(`studio: ${url.pathname} — ${error.message}`);
    json(res, 400, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`studio: writing to ${ROOT.replace(process.env.HOME ?? '', '~')}`);
  console.log(`studio: listening on http://127.0.0.1:${PORT}`);
  if (!hasVideoConverter()) console.log('studio: no /usr/bin/avconvert — .mov uploads will be refused');
});
