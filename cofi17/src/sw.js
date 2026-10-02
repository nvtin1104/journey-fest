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
const shellUrl = new URL('/', self.location.origin).href;
const indexUrl = new URL('/index.html', self.location.origin).href;

// Cloudflare Pages answers `/index.html` with a redirect to `/`. A response that went through
// a redirect is rejected by the browser when used for a page navigation ("This site can't be
// reached"), so store and serve a plain copy of the body instead.
async function unredirected(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function savedShell() {
  const shell = (await caches.match(shellUrl)) ?? (await caches.match(indexUrl));
  return shell ? unredirected(shell) : undefined;
}

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
      // The installed app launches at `/` while the precache entry is `/index.html`.
      // Save both URL forms so a cold offline launch can always find the app shell.
      const fetched = await fetch(shellUrl, { cache: 'reload' });
      if (!fetched.ok) throw new Error(`Failed to save app shell (${fetched.status})`);
      const shellResponse = await unredirected(fetched);
      await cache.put(indexUrl, shellResponse.clone());
      await cache.put(shellUrl, shellResponse);
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
              await cache.put(assetUrl, await unredirected(response));
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
      const shell = await savedShell();
      try {
        // On a weak connection don't leave the visitor on a blank screen: fall back to the
        // saved shell if the network hasn't answered in a few seconds.
        const network = fetch(request);
        const response = shell
          ? await Promise.race([network, new Promise((resolve) => setTimeout(resolve, 4000))])
          : await network;
        // Cloudflare or an intermediary can return an error page instead of rejecting fetch.
        // Treat those responses as a network failure and use the saved app shell.
        if (response?.ok) return response;
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
