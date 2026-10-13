import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Canonical origin used for <link rel="canonical">, Open Graph URLs and sitemap.xml.
  site: 'https://artistday21.pages.dev',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
  server: { port: 4321 },
});
