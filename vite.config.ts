import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 4317,
    strictPort: true,
  },
  build: {
    target: 'es2022',
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
