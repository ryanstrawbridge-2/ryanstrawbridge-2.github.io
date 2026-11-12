/**
 * Read/modify/write project frontmatter without reformatting it.
 *
 * Uses yaml's Document API, which round-trips byte-identically: untouched keys
 * keep their original quoting, key order and line wrapping. That matters because
 * TinaCMS writes this same file — a full reserialize would turn a one-field edit
 * into a whole-block diff and invite a conflict with the next CMS commit.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

export const readProject = async (contentDir, slug) => {
  const path = join(contentDir, `${slug}.md`);
  const source = await readFile(path, 'utf8');
  const match = source.match(FRONTMATTER);
  if (!match) throw new Error(`${slug}.md has no frontmatter block`);
  return { path, source, raw: match[1], header: match[0], doc: YAML.parseDocument(match[1]) };
};

export const writeProject = async (file) => {
  // lineWidth 0 disables yaml's line folding. Without it a long summary gets
  // wrapped onto a second line, which reads as a change in every future diff.
  const next = file.doc.toString({ lineWidth: 0 }).replace(/\n$/, '');
  await writeFile(file.path, file.source.replace(file.header, `---\n${next}\n---\n`), 'utf8');
};

/** The gallery sequence node, created if the project doesn't have one yet. */
const galleryNode = (doc) => {
  let node = doc.get('gallery');
  if (!node || !YAML.isSeq(node)) {
    doc.set('gallery', doc.createNode([]));
    node = doc.get('gallery');
  }
  return node;
};

/**
 * Apply a patch to one gallery row. A key set to null or '' is deleted rather
 * than written as an empty value — the Astro schema treats absent and empty
 * differently for `section`, and a stray `width: ''` fails enum parsing, which
 * on a CMS commit means a failed deploy and a silently stale site.
 */
export const patchGalleryItem = (doc, index, patch) => {
  const seq = galleryNode(doc);
  const item = seq.get(index);
  if (!item) throw new Error(`no gallery row at index ${index}`);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') item.delete(key);
    else item.set(key, value);
  }
};

export const appendGalleryItem = (doc, fields) => {
  const seq = galleryNode(doc);
  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
  seq.add(doc.createNode(clean));
  return seq.items.length - 1;
};

export const removeGalleryItem = (doc, index) => {
  const seq = galleryNode(doc);
  if (!seq.get(index)) throw new Error(`no gallery row at index ${index}`);
  seq.delete(index);
};

export const moveGalleryItem = (doc, from, to) => {
  const seq = galleryNode(doc);
  if (from === to) return;
  const item = seq.get(from);
  if (!item) throw new Error(`no gallery row at index ${from}`);
  seq.delete(from);
  seq.items.splice(to, 0, item);
};

/** Top-level frontmatter keys, e.g. heroFocalPoint / heroAspect / galleryLayout. */
export const patchTopLevel = (doc, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    // A dotted key ("figures.0.takeaway") is a path into a list, not a new
    // top-level key. Writing it literally used to leave `figures.0.takeaway:`
    // at the bottom of the file, where nothing reads it.
    if (key.includes('.')) {
      const path = key.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
      if (!doc.getIn(path.slice(0, -1))) throw new Error(`${key}: no such item`);
      if (value === null || value === undefined || value === '') doc.deleteIn(path);
      else doc.setIn(path, value);
      continue;
    }
    if (value === null || value === undefined || value === '') doc.delete(key);
    else doc.set(key, value);
  }
};
