// @ts-check
import { defineConfig } from 'astro/config';

/* Where the built site will live. Both are overridable from the environment so
   the same tree deploys to GitHub Pages (a project path) and to a custom domain
   (root) without editing this file.

     SITE_URL   https://wellness.plumhq.com     -> BASE_PATH=/
     SITE_URL   https://asawarig.github.io      -> BASE_PATH=/bangalorehealthmap

   The Webflow embed uses whichever URL this produces, so it matters. */
const site = process.env.SITE_URL || 'https://asawarig.github.io';
const base = process.env.BASE_PATH || '/bangalorehealthmap';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    // Webflow embeds an iframe against a stable URL, so keep /embed as
    // /embed/index.html rather than /embed.html.
    format: 'directory',
  },
  vite: {
    build: {
      // The map data is one big chunk of JSON. Inlining it as a data URL would
      // only make the entry script harder to cache.
      assetsInlineLimit: 0,
    },
  },
});
