// Service worker do FargusGram
// - abre rápido (guarda os arquivos do app)
// - guarda as fotos já vistas (economiza internet e o limite grátis do Supabase)
// - nunca guarda respostas da API (feed, curtidas etc. vêm sempre frescas)

const VERSION = 'fg-v1';
const APP_CACHE = `${VERSION}-app`;
const IMG_CACHE = `${VERSION}-img`;
const MAX_IMAGES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png']))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function trimImages() {
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) {
    await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fotos públicas do Supabase Storage: o caminho nunca muda, então dá para guardar
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMG_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone()).then(trimImages).catch(() => {});
        }
        return res;
      })()
    );
    return;
  }

  // Só cuidamos de arquivos do próprio app daqui para baixo
  if (url.origin !== self.location.origin) return;

  // Navegação: tenta a rede; sem internet, usa a última versão salva
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(APP_CACHE);
          cache.put('./index.html', res.clone()).catch(() => {});
          return res;
        } catch {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // Arquivos com hash no nome (assets/…): nunca mudam
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      })()
    );
  }
});
