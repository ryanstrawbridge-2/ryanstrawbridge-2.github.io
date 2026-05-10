// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ryanstrawbridge-2.github.io',
  integrations: [
    sitemap({
      // Drop /admin/ (TinaCMS editor) from the public sitemap.
      filter: (page) => !page.includes('/admin'),
    }),
  ],
});
