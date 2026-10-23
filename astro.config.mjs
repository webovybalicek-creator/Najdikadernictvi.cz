import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://najdikadernictvi.cz',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
