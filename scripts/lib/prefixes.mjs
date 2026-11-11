/**
 * Photo inbox naming scheme: PREFIX_title.ext
 *
 *   ABV_p-and-id.png    -> actuated-ball-valves, saved as actuated-ball-valves-p-and-id.png
 *   Lift_proof-test.jpg -> lifting-frame
 *   gen_headshot.jpg    -> general: offered on every project, imported into the one you are on
 *
 * The map lives in photo-prefixes.json at the repo root so it can be edited
 * without touching code. It is re-read on every call: adding a prefix while
 * studio is running takes effect on the next library open, no restart.
 *
 * Shared by scripts/studio-server.mjs (library panel) and
 * scripts/media-intake.mjs (npm run photos) so the two can't disagree about
 * where a file belongs.
 */

import { readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { slugify } from './media.mjs';

export const loadPrefixes = async (root) => {
  try {
    const raw = JSON.parse(await readFile(join(root, 'photo-prefixes.json'), 'utf8'));
    const map = new Map();
    for (const [key, slug] of Object.entries(raw.prefixes ?? {})) {
      map.set(key.toLowerCase(), slug ?? null);
    }
    return map;
  } catch {
    // A missing or broken map degrades to "nothing is sorted" rather than
    // refusing to list the inbox at all.
    return new Map();
  }
};

/**
 * Split a filename into prefix and title.
 *
 * Returns { prefix, title, slug, general, known }:
 *   known   — the prefix is in the map
 *   general — it maps to null (gen_)
 *   slug    — the project it maps to, or null
 *   title   — slugified title part, used for the output filename
 *
 * A name with no underscore has no prefix; its whole stem is the title.
 */
export const parseInboxName = (name, prefixes) => {
  const stem = basename(name, extname(name));
  const at = stem.indexOf('_');
  if (at <= 0) {
    return { prefix: null, title: slugify(stem) || 'photo', slug: null, general: false, known: false };
  }
  const prefix = stem.slice(0, at).toLowerCase();
  const title = slugify(stem.slice(at + 1)) || 'photo';
  const known = prefixes.has(prefix);
  const slug = known ? prefixes.get(prefix) : null;
  return { prefix, title, slug, general: known && slug === null, known };
};
