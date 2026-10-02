// Injected by vite-plugin-pwa at build time. These are the files offered by the
// explicit "Tải dữ liệu dùng offline" action, not downloaded during installation.
const offlineAssets = self.__WB_MANIFEST;
const cachePrefix = 'journey-fest-offline-';
const liveMapUrl = __LIVE_MAP_URL__;
const signature = offlineAssets.reduce((hash, entry) => {
  for (const char of `${entry.url}:${entry.revision ?? ''}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash;
}, 7);
const cacheName = `${cachePrefix}${Math.abs(signature).toString(36)}`;

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== 'CACHE_OFFLINE' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      // The installed app may launch at `/` while the precache entry is `/index.html`.
      // Save both URL forms so a cold offline launch can always find the app shell.
      const shellUrl = new URL('/index.html', self.location.origin).href;
      const shellResponse = await fetch(shellUrl, { cache: 'reload' });
      if (!shellResponse.ok) throw new Error(`Failed to save app shell (${shellResponse.status})`);
      await cache.put(shellUrl, shellResponse.clone());
      await cache.put(new URL('/', self.location.origin).href, shellResponse);
      let next = 0;
      let completed = 0;
      let failure = null;
      const total = offlineAssets.length + 1;
      completed++;
      port.postMessage({ type: 'OFFLINE_PROGRESS', completed, total });
      const cacheAsset = async () => {
        while (next < offlineAssets.length && !failure) {
          const entry = offlineAssets[next++];
          const url = typeof entry === 'string' ? entry : entry.url;
          const assetUrl = new URL(url, self.location.origin).href;
          try {
            const cached = await cache.match(assetUrl);
            if (!cached) {
              const response = await fetch(assetUrl, { cache: 'reload' });
              if (!response.ok) throw new Error(`Failed to save ${url} (${response.status})`);
              await cache.put(assetUrl, response);
            }
            completed++;
            port.postMessage({ type: 'OFFLINE_PROGRESS', completed, total });
          } catch (error) {
            failure = error;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, total) }, cacheAsset));
      if (failure) throw failure;
      const oldCaches = await caches.keys();
      await Promise.all(oldCaches.filter((name) =>
        (name.startsWith(cachePrefix) && name !== cacheName) || name.startsWith('workbox-precache-'),
      ).map((name) => caches.delete(name)));
      port.postMessage({ type: 'OFFLINE_READY' });
    } catch (error) {
      await caches.delete(cacheName);
      port.postMessage({ type: 'OFFLINE_ERROR', message: String(error) });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (liveMapUrl && request.url.startsWith(liveMapUrl)) {
    event.respondWith((async () => {
      const cache = await caches.open('journey-fest-map-data');
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) ?? Response.error();
      }
    })());
    return;
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await caches.match(new URL('/', self.location.origin).href)
        ?? await caches.match(new URL('/index.html', self.location.origin).href);
      try {
        const response = await fetch(request);
        // Cloudflare or an intermediary can return an error page instead of rejecting fetch.
        // Treat those responses as a network failure and use the saved app shell.
        if (response.ok) return response;
      } catch {
        // Continue to the saved shell below.
      }
      return shell ?? Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) return response;
      return (await caches.match(request)) ?? response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});
