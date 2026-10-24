import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://najdikadernictvi.cz',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // CSS jako sdílený soubor (cache v prohlížeči) místo vkládání do každé z tisíců stránek
    inlineStylesheets: 'auto',
  },
});
