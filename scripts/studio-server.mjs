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
import { writeFile, mkdir, unlink, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
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
 * Astro's dev server does not hot-reload content-collection markdown that was
 * changed by another process — the .astro watcher fires, the content one
 * doesn't, so the page keeps rendering the previous frontmatter. Touching
 * src/content.config.ts does force a content re-sync and a page reload, so
 * that's the nudge.
 *
 * Debounced: a crop drag ends in one save, but a burst of uploads shouldn't
 * reload the page once per file.
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

const ROUTES = {
  '/gallery/patch': ({ slug, index, patch }) =>
    withProject(slug, (file) => patchGalleryItem(file.doc, index, patch)),
  '/gallery/delete': ({ slug, index }) =>
    withProject(slug, (file) => removeGalleryItem(file.doc, index)),
  '/gallery/move': ({ slug, from, to }) =>
    withProject(slug, (file) => moveGalleryItem(file.doc, from, to)),
  '/project/patch': ({ slug, patch }) => withProject(slug, (file) => patchTopLevel(file.doc, patch)),
  '/upload': handleUpload,
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
    json(res, 200, { ok: true, projects: await projectSlugs(CONTENT), video: hasVideoConverter() });
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
