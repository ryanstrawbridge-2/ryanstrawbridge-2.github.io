/**
 * File the photo inbox into the photo library, by prefix.
 *
 *   photo-inbox/Lift_BTH1.png  ->  portfolio-photos/lifting-frame/BTH1.png
 *   photo-inbox/gen_desk.jpg   ->  portfolio-photos/general/desk.jpg
 *
 * Runs on every studio Save, and on its own with `npm run photos:sort`.
 *
 * Rules, because portfolio-photos/ is Ryan's archive of originals and git has
 * no copy of it:
 *   - a move, never a copy-then-delete, and never across volumes
 *   - never overwrites: a name already taken gets " 2", " 3"...
 *   - files with no prefix, or a prefix not in photo-prefixes.json, stay put
 *   - only loose files at the top of photo-inbox/ (not _done/ or old
 *     <slug>/ folders), and only media files
 *
 * The bytes are untouched. Photos that went on the site were already copied
 * (resized, metadata stripped) into src/assets/images when they were picked,
 * so moving the original afterwards changes nothing on the page.
 */

import { readdir, rename, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { loadPrefixes, parseInboxName } from './prefixes.mjs';

const MEDIA_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff', '.gif',
  '.mp4', '.m4v', '.mov', '.pdf',
]);

/** "BTH1.png" -> "BTH1 2.png" -> "BTH1 3.png" until free. */
const freeName = (dir, name) => {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = basename(name, ext);
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
};

export const fileInbox = async (root, { dryRun = false } = {}) => {
  const inbox = join(root, 'photo-inbox');
  const library = join(root, 'portfolio-photos');
  if (!existsSync(inbox) || !existsSync(library)) return { moved: [], skipped: [] };

  const prefixes = await loadPrefixes(root);
  const moved = [];
  const skipped = [];

  for (const name of await readdir(inbox)) {
    if (name.startsWith('.') || name.startsWith('_')) continue;
    const from = join(inbox, name);
    if (!(await stat(from)).isFile()) continue;
    if (!MEDIA_EXT.has(extname(name).toLowerCase())) continue;

    const parsed = parseInboxName(name, prefixes);
    if (!parsed.known) {
      skipped.push({ name, reason: parsed.prefix ? `unknown prefix "${parsed.prefix}_"` : 'no prefix' });
      continue;
    }
    const folder = parsed.general ? 'general' : parsed.slug;
    const dir = join(library, folder);
    // Keep the original's own name, minus the routing prefix.
    const rest = name.slice(name.indexOf('_') + 1) || name;
    const target = freeName(dir, rest);
    if (!dryRun) {
      await mkdir(dir, { recursive: true });
      await rename(from, join(dir, target));
    }
    moved.push({ name, to: `portfolio-photos/${folder}/${target}` });
  }
  return { moved, skipped };
};
