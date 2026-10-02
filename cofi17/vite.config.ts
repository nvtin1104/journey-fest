import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const mapUrl = loadEnv(mode, '.', 'VITE_').VITE_MAP_URL ?? '';
  return {
    define: { __LIVE_MAP_URL__: JSON.stringify(mapUrl) },
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
    plugins: [
      // Offline + "Add to Home Screen". Registration and full asset caching are user initiated.
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'prompt',
        injectRegister: false,
        includeManifestIcons: false,
        manifest: {
          name: 'Color Fiesta · Bản đồ 3D',
          short_name: 'Color Fiesta',
          description: 'Bản đồ 3D Color Fiesta: tham quan gian hàng, xem lịch trình và sơ đồ, dùng được cả khi không có mạng.',
          lang: 'vi',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#5b45c9',
          background_color: '#f3ecff',
          icons: [
            { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,jpg}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ],
    test: {
      environment: 'node',
    },
  };
});
