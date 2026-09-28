import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 4317,
    strictPort: true,
  },
  build: {
    // WebGL2 (required by three.js) starts at Safari 15; transpile anything newer than these browsers.
    target: ['es2021', 'safari15', 'chrome100', 'edge100', 'firefox100'],
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // three.js changes rarely: keep it in its own long-cached chunk, apart from app code and map data.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/].*three[\\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
});
