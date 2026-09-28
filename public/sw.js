// Service worker do FargusGram
// - abre rápido (guarda os arquivos do app)
// - guarda as fotos já vistas (economiza internet e o limite grátis do Supabase)
// - nunca guarda respostas da API (feed, curtidas etc. vêm sempre frescas)
// - mostra as notificações no celular e abre o app no lugar certo ao tocar

const VERSION = 'fg-v2';
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

// ---------------------------------------------------------------------
// Notificações no celular
// ---------------------------------------------------------------------
// O Safari (iPhone e Mac) exige mostrar um aviso para cada notificação recebida
const MUST_SHOW = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|Android|Edg/.test(self.navigator.userAgent);

function appUrl(path) {
  return new URL(path || './', self.registration.scope).href;
}

// "#/direct/123?como=abc" -> "#/direct/123"
function routeOf(url) {
  try {
    return new URL(url).hash.split('?')[0];
  } catch {
    return '';
  }
}

async function setBadge(n) {
  try {
    if (typeof n !== 'number' || !self.navigator.setAppBadge) return;
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    /* nem todo aparelho tem número no ícone */
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const url = appUrl(data.url || './');
  event.waitUntil(
    (async () => {
      await setBadge(data.badge);
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      wins.forEach((c) => c.postMessage({ type: 'fg-push', data }));
      // quem já está olhando essa conversa/post não precisa do aviso
      const viewing = wins.some((c) => c.visibilityState === 'visible' && c.focused && routeOf(c.url) === routeOf(url));
      if (viewing && !MUST_SHOW) return;
      await self.registration.showNotification(data.title || 'FargusGram', {
        body: data.body || '',
        icon: appUrl('./icons/icon-192.png'),
        badge: appUrl('./icons/badge-96.png'),
        tag: data.tag || undefined,
        renotify: !!data.tag,
        timestamp: Date.now(),
        data: { url },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || appUrl('./');
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((c) => c.url.startsWith(self.registration.scope)) || wins[0];
      if (win) {
        try {
          await win.focus();
        } catch {
          /* alguns navegadores não deixam */
        }
        win.postMessage({ type: 'fg-open', url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});

// O navegador trocou a assinatura: assina de novo com a mesma chave.
// O app manda a nova para o servidor na próxima vez que abrir.
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => {}));
});
