/**
 * Shared media handling. Imported by scripts/media-intake.mjs (the CLI) and
 * scripts/studio-server.mjs (the live editor) so a photo dropped on the page
 * and a photo run through the terminal come out identical.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);
export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov']);

export const DEFAULT_MAX_EDGE = 2400;

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

/** First free filename in `dir` for `<base><ext>`, adding -2, -3 as needed. */
export const uniqueName = async (dir, base, ext) => {
  let candidate = `${base}${ext}`;
  let n = 2;
  while (existsSync(join(dir, candidate))) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }
  return candidate;
};

const basePipeline = (input, maxEdge) =>
  sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });

/**
 * Re-encode for the web. Returns { data, ext }.
 *
 * PNG sources stay PNG unless forceJpeg: a CAD render or a dimensioned drawing
 * is line art, and JPEG puts ringing along every edge. Photographs become JPEG,
 * which is several times smaller at a quality nobody can see the difference in.
 * sharp drops metadata unless asked to keep it, so EXIF (GPS included) goes away
 * for free — .rotate() runs first so orientation survives the strip.
 */
export const encode = async (input, sourceExt, { maxEdge = DEFAULT_MAX_EDGE, forceJpeg = false } = {}) => {
  const pipeline = basePipeline(input, maxEdge);
  if (sourceExt === '.png' && !forceJpeg) {
    return { data: await pipeline.png({ compressionLevel: 9, effort: 8 }).toBuffer(), ext: '.png' };
  }
  return {
    data: await pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer(),
    ext: '.jpg',
  };
};

/**
 * Same pipeline pinned to the source container, for rewriting a file under its
 * existing name. A .png holding JPEG bytes sails past sharp and then trips
 * Astro's extension-based probe, so --shrink must never change the format.
 */
export const encodeKeepingFormat = async (input, sourceExt, { maxEdge = DEFAULT_MAX_EDGE } = {}) => {
  const pipeline = basePipeline(input, maxEdge);
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

/**
 * .mov -> .mp4 using avconvert, which ships with macOS. No ffmpeg needed, and
 * no Homebrew dependency to keep alive. Preset960x540 lands a typical phone
 * clip under the 5 MB that SSH pushes start stalling on.
 */
export const convertVideo = async (sourcePath, outPath, preset = 'Preset960x540') => {
  await run('/usr/bin/avconvert', [
    '--source', sourcePath,
    '--output', outPath,
    '--preset', preset,
    '--replace',
  ]);
  return outPath;
};

export const hasVideoConverter = () => existsSync('/usr/bin/avconvert');

/** Project slugs, read from the content directory. */
export const projectSlugs = async (contentDir) =>
  (await readdir(contentDir)).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'));

export { extname };
