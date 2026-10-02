import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig(({ mode }) => {
  const mapUrl = loadEnv(mode, '.', 'VITE_').VITE_MAP_URL;
  return {
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
      // Offline + "Add to Home Screen". The service worker precaches the whole app (code, font,
      // posters, map scans) on the first visit; registration and the update prompt live in src/ui/pwa.ts.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        // Icons are already matched by globPatterns below; the plugin adds the manifest itself.
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
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,jpg}'],
          // Anything bigger is skipped with a build warning: run it through `pnpm image` first.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Live map data (optional): use the network, fall back to the last copy when offline.
          runtimeCaching: mapUrl
            ? [{
                urlPattern: new RegExp(`^${escapeRegExp(mapUrl)}`),
                handler: 'NetworkFirst',
                options: { cacheName: 'map-data', networkTimeoutSeconds: 5 },
              }]
            : [],
        },
      }),
    ],
    test: {
      environment: 'node',
    },
  };
});
