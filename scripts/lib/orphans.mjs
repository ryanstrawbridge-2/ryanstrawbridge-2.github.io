/**
 * Clean up a media file when the last thing pointing at it stops pointing.
 *
 * Replacing a home slot twice, or removing a gallery row, used to leave the
 * displaced file sitting in src/assets/ forever — three duplicate uploads and
 * 2.2 MB after one editing session. The build's pruner only cleans dist, so
 * these get committed and never noticed.
 *
 * The rule is deliberately conservative:
 *   - still referenced anywhere  -> keep, obviously
 *   - unreferenced AND untracked -> delete; it was uploaded this session, so
 *                                   git has no copy and nothing else can want it
 *   - unreferenced AND tracked   -> KEEP and report. It's in history, deleting
 *                                   saves nothing there, and it may be a file
 *                                   Ryan put in deliberately years ago.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import YAML from 'yaml';
import { trashFile } from './journal.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Turn a stored reference into a repo-relative path.
 *
 * The same file is written four different ways depending on which field holds
 * it — see the home/gallery video note in studio-server.mjs.
 */
export const resolveStored = (value) => {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  // /videos/x.mp4  (home showcase)
  if (/^\/videos\//.test(v)) return `public${v}`;
  // x.mp4  (project gallery video — bare filename)
  if (/^[^/]+\.(mp4|m4v|mov)$/i.test(v)) return `public/videos/${v}`;

  // Every image form ends in assets/images/<rest>, whichever prefix it carries:
  //   /src/assets/images/x        (JSON)
  //   ../../assets/images/x       (markdown)
  //   /src/assets/images../../assets/images/x   (the CMS concat bug)
  const match = v.match(/assets\/images\/(.+)$/);
  return match ? `src/assets/images/${match[1]}` : null;
};

/** Every media path currently referenced by site data and project content. */
export const referencedPaths = async (root) => {
  const refs = new Set();
  const add = (value) => {
    const path = resolveStored(value);
    if (path) refs.add(path);
  };

  const walkJson = (node) => {
    if (Array.isArray(node)) node.forEach(walkJson);
    else if (node && typeof node === 'object') Object.values(node).forEach(walkJson);
    else if (typeof node === 'string') add(node);
  };

  const dataDir = join(root, 'src/data');
  for (const name of await readdir(dataDir)) {
    if (!name.endsWith('.json')) continue;
    try {
      walkJson(JSON.parse(await readFile(join(dataDir, name), 'utf8')));
    } catch {
      // A data file mid-write shouldn't make us delete someone's photo.
      throw new Error(`could not read src/data/${name}; skipping cleanup`);
    }
  }

  const contentDir = join(root, 'src/content/projects');
  for (const name of await readdir(contentDir)) {
    if (!name.endsWith('.md')) continue;
    const text = await readFile(join(contentDir, name), 'utf8');
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      // Parse the frontmatter properly rather than pattern-matching it. A
      // regex that misses one field deletes a photo that's still on the page,
      // so this half has to be exact, not approximate.
      try {
        walkJson(YAML.parse(match[1]));
      } catch {
        throw new Error(`could not parse frontmatter in ${name}; skipping cleanup`);
      }
    }
    // Images written into the body markdown.
    for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) add(m[1]);
  }

  return refs;
};

/** Is this path committed? Untracked means git has no copy to fall back on. */
export const isTracked = async (root, path) => {
  try {
    await run('git', ['ls-files', '--error-unmatch', path], { cwd: root });
    return true;
  } catch {
    return false;
  }
};

/**
 * Called AFTER the reference has already been changed, so `referencedPaths`
 * reflects the new state. Returns what happened, for the toast.
 */
export const cleanupDisplaced = async (root, previousValue) => {
  const path = resolveStored(previousValue);
  if (!path) return null;

  const full = join(root, path);
  if (!existsSync(full)) return null;

  let refs;
  try {
    refs = await referencedPaths(root);
  } catch {
    return null; // couldn't be sure; never delete on uncertainty
  }
  if (refs.has(path)) return null; // something else still uses it

  if (await isTracked(root, path)) {
    return { file: basename(path), path, deleted: false, reason: 'tracked' };
  }

  const { size } = await stat(full);
  // Moved, not unlinked: the journal restores an undone delete from
  // .photo-trash/, and it can only do that if the bytes still exist.
  await trashFile(root, path);
  return { file: basename(path), path, deleted: true, bytes: size };
};
