// Resolves an image path stored in a JSON data file to an Astro asset.
//
// Content collections get this for free via the image() schema helper, but
// src/data/*.json is a plain JSON import — nothing resolves a string there into
// an ImageMetadata, so images referenced from site data used to be hardcoded
// `import` statements in index.astro. That's what made most of the homepage
// uneditable: the CMS can only offer a dropdown of keys that map to those
// imports, never an upload.
//
// Globbing every asset eagerly gives us a path -> ImageMetadata map that a
// stored string can look into, so the CMS can write any path it likes.

import type { ImageMetadata } from 'astro';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/images/**/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,avif}',
  { eager: true },
);

/**
 * Accepts every shape these paths turn up in — TinaCMS writes
 * `/src/assets/images/x`, the build's path normalizer rewrites it to
 * `../../assets/images/x`, and the concat bug produces
 * `/src/assets/images../../assets/images/x`. All of them mean the same file.
 */
export const resolveSiteImage = (path?: string | null): ImageMetadata | undefined => {
  if (!path) return undefined;
  const match = String(path).match(/assets\/images\/(.+)$/);
  const relative = match ? match[1] : String(path).replace(/^\/+/, '');
  return modules[`/src/assets/images/${relative}`]?.default;
};

/** Every asset path, for building CMS dropdowns or debugging a bad reference. */
export const siteImagePaths = Object.keys(modules);
