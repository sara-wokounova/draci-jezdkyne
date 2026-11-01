import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Relative paths make the built app work both at / and at /repo-name/ on GitHub Pages.
  base: './',
  build: {
    rollupOptions: {
      // The game, the play-test page and its …/playtest/ address (a redirect, D33).
      input: { main: page('index.html'), playtest: page('playtest.html'), playtestFolder: page('playtest/index.html') },
    },
  },
});
