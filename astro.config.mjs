// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeImageCaptions from './scripts/rehype-image-captions.mjs';

export default defineConfig({
  site: 'https://ryanstrawbridge-2.github.io',
  // The TinaCMS editor is a static file at public/admin/index.html. Astro's
  // dev server doesn't resolve a bare directory to its index, so /admin/
  // 404s locally while the deployed site (GitHub Pages, which does resolve
  // directory indexes) works. Redirecting makes the short URL work in both.
  redirects: {
    '/admin': '/admin/index.html',
  },
  integrations: [
    sitemap({
      // Drop /admin/ (TinaCMS editor) from the public sitemap.
      filter: (page) => !page.includes('/admin'),
    }),
  ],
  markdown: {
    // Wrap standalone images in <figure>/<figcaption> so gallery photos
    // get captions from their alt text.
    rehypePlugins: [rehypeImageCaptions],
  },
});
