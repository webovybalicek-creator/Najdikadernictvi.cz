import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://najdikadernictvi.cz',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [sitemap({ filter: (page) => !page.includes('/hledat/') })],
});
