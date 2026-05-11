// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeImageCaptions from './scripts/rehype-image-captions.mjs';

export default defineConfig({
  site: 'https://ryanstrawbridge-2.github.io',
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
