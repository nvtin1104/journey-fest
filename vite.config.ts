import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 4317,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
});
