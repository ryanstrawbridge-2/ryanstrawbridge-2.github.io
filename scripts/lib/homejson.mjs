/**
 * Read/patch/write src/data/home.json by dot path.
 *
 * Unlike project frontmatter, this is plain JSON with no comments, so a
 * reserialize is lossless — 2-space indent matches what the CMS writes, so a
 * studio edit and a CMS edit produce the same shape and don't fight.
 */

import { readFile, writeFile } from 'node:fs/promises';

/** "showcase.items.2.image" -> ["showcase","items","2","image"] */
const parts = (path) => String(path).split('.').filter(Boolean);

export const readHome = async (file) => JSON.parse(await readFile(file, 'utf8'));

export const writeHome = async (file, data) =>
  writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

export const getPath = (data, path) =>
  parts(path).reduce((node, key) => (node == null ? undefined : node[key]), data);

/**
 * Set one leaf. The parent must already exist: a path that doesn't resolve
 * means the caller got it wrong, and silently inventing branches would write
 * fields the Astro template never reads.
 *
 * `create` allows the LEAF to be new, for fields that are genuinely optional
 * in the data — an uncropped tile has no focal key at all until you crop it.
 */
export const setPath = (data, path, value, { create = false } = {}) => {
  const keys = parts(path);
  if (keys.length === 0) throw new Error('empty path');
  let node = data;
  for (const key of keys.slice(0, -1)) {
    if (node == null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`no such field: ${path}`);
    }
    node = node[key];
  }
  const leaf = keys[keys.length - 1];
  if (node == null || typeof node !== 'object') throw new Error(`no such field: ${path}`);
  // `create` is for fields that are genuinely optional in the data — a crop
  // that has never been set has no key at all. The parent must still exist,
  // so a typo in the section name is still refused.
  if (!(leaf in node) && !create) throw new Error(`no such field: ${path}`);
  if (value === null || value === undefined || value === '') delete node[leaf];
  else node[leaf] = value;
  return data;
};
