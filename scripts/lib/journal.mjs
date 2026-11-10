/**
 * Undo for the live editor.
 *
 * Every studio edit writes to disk the instant you release the mouse — that is
 * what makes the preview honest, because the page you see is Astro's real
 * render of the real file. The cost is that there was no way back except git,
 * which made experimenting with a crop feel expensive.
 *
 * The journal snapshots the small text files before each write and compares the
 * media tree around it. Undo restores the text and reverses whatever the write
 * did to the media:
 *
 *   created a file  -> delete it
 *   deleted a file  -> move it back out of .photo-trash/
 *
 * Why snapshot every text file rather than predict which one a route touches:
 * the set is eight project markdown files plus home.json, about 30 KB in all.
 * Guessing wrong would silently fail to restore something, and the whole point
 * of an undo is that it is trustworthy. Cheap certainty beats clever.
 */

import { readFile, writeFile, readdir, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';

const DEPTH = 40; // entries kept; each is ~30 KB of text
const MEDIA_EXT = /\.(jpe?g|png|webp|avif|gif|svg|mp4|mov|m4v)$/i;

/** Files whose full contents are snapshotted before every write. */
const textFiles = async (root) => {
  const out = [];
  const content = join(root, 'src/content/projects');
  if (existsSync(content))
    for (const name of await readdir(content))
      if (name.endsWith('.md')) out.push(join(content, name));
  for (const rel of ['src/data/home.json', 'src/data/site.json', 'src/data/navigation.json']) {
    const full = join(root, rel);
    if (existsSync(full)) out.push(full);
  }
  return out;
};

/** Every media file under the directories studio can write to. */
const mediaFiles = async (root) => {
  const found = new Set();
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (MEDIA_EXT.test(entry.name)) found.add(relative(root, full));
    }
  };
  await walk(join(root, 'src/assets/images'));
  await walk(join(root, 'public/videos'));
  return found;
};

const snapshot = async (root) => {
  const text = new Map();
  for (const file of await textFiles(root)) {
    try {
      text.set(file, await readFile(file, 'utf8'));
    } catch {
      // A file that can't be read now can't be restored later either; skipping
      // it is better than refusing to journal the whole edit.
    }
  }
  return { text, media: await mediaFiles(root) };
};

/**
 * `.photo-trash/<original relative path>` — the structure is preserved so a
 * restore is a plain move back, with no filename matching to get wrong.
 */
export const TRASH = '.photo-trash';

export const trashFile = async (root, relPath) => {
  const from = join(root, relPath);
  const to = join(root, TRASH, relPath);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to).catch(async (error) => {
    // Cross-device or an existing file at the target: copy-then-remove.
    if (error.code !== 'EXDEV' && error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
    await writeFile(to, await readFile(from));
    await unlink(from);
  });
  return to;
};

// ---------------------------------------------------------------------------

const entries = [];
let pending = null;

/** Called before a write route runs. */
export const begin = async (root, label) => {
  pending = { label, at: Date.now(), ...(await snapshot(root)) };
};

/**
 * Called after it succeeds. Entries that changed nothing on disk are dropped,
 * so a no-op save (dragging a crop back where it started) doesn't bury the
 * edit you actually want to undo.
 */
export const commit = async (root) => {
  if (!pending) return;
  const now = await snapshot(root);
  const textChanged = [...pending.text].some(([file, before]) => now.text.get(file) !== before);
  const created = [...now.media].filter((f) => !pending.media.has(f));
  const removed = [...pending.media].filter((f) => !now.media.has(f));

  if (textChanged || created.length || removed.length) {
    entries.push({ label: pending.label, at: pending.at, text: pending.text, created, removed });
    while (entries.length > DEPTH) entries.shift();
  }
  pending = null;
};

/** Abandon the in-flight snapshot when a route throws. */
export const abort = () => {
  pending = null;
};

export const state = () => ({
  depth: entries.length,
  next: entries.length ? entries[entries.length - 1].label : null,
});

/**
 * Undo the most recent edit.
 *
 * Order matters: text first, so that if a media step fails the page is already
 * consistent with what the user expects to see.
 */
export const undo = async (root) => {
  const entry = entries.pop();
  if (!entry) return { ok: false, reason: 'nothing to undo' };

  let restoredText = 0;
  for (const [file, before] of entry.text) {
    try {
      if ((await readFile(file, 'utf8')) === before) continue;
      await writeFile(file, before, 'utf8');
      restoredText += 1;
    } catch {
      // The file was deleted outside studio. Put the remembered copy back.
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, before, 'utf8');
      restoredText += 1;
    }
  }

  // Anything this edit created goes away again.
  let deleted = 0;
  for (const rel of entry.created) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    try {
      await trashFile(root, rel);
      deleted += 1;
    } catch {
      /* leave it rather than fail the undo */
    }
  }

  // Anything it removed comes back out of the trash.
  let restoredMedia = 0;
  const missing = [];
  for (const rel of entry.removed) {
    const full = join(root, rel);
    if (existsSync(full)) continue;
    const trashed = join(root, TRASH, rel);
    if (!existsSync(trashed)) {
      missing.push(rel);
      continue;
    }
    await mkdir(dirname(full), { recursive: true });
    await rename(trashed, full).catch(() => missing.push(rel));
    restoredMedia += 1;
  }

  return {
    ok: true,
    label: entry.label,
    restoredText,
    restoredMedia,
    deleted,
    ...(missing.length ? { missing } : {}),
    remaining: entries.length,
  };
};

/** How much is sitting in the trash, for the housekeeping line in /health. */
export const trashSize = async (root) => {
  let bytes = 0;
  let count = 0;
  const walk = async (dir) => {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) await walk(full);
      else if (MEDIA_EXT.test(item.name) || extname(item.name)) {
        try {
          bytes += (await stat(full)).size;
          count += 1;
        } catch {
          /* ignore */
        }
      }
    }
  };
  await walk(join(root, TRASH));
  return { count, bytes };
};
