/* =============================================================================
 * Service Worker — Painel de Ganhos
 * -----------------------------------------------------------------------------
 * O app se dizia offline mas não tinha service worker: abrir sem internet dava
 * tela branca. Aqui o shell inteiro (HTML, CSS, módulos JS, supabase-js) é
 * pré-cacheado no install, então o app abre offline e trabalha com o cache
 * local — a sincronização com a nuvem sobe sozinha quando a rede voltar.
 *
 * Regras:
 *  - só GET e só mesma origem entram no cache;
 *  - chamadas ao Supabase (outra origem) passam direto, nunca são cacheadas;
 *  - navegação usa network-first (pega deploy novo) com fallback para o cache.
 * ========================================================================== */

const VERSION = 'v3.0.0';
const SHELL_CACHE = `painel-shell-${VERSION}`;
const RUNTIME_CACHE = `painel-runtime-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/main.js',
  './assets/js/constants.js',
  './assets/js/i18n.js',
  './assets/js/format.js',
  './assets/js/calc.js',
  './assets/js/merge.js',
  './assets/js/state.js',
  './assets/js/db.js',
  './assets/js/export.js',
  './assets/js/ui/dom.js',
  './assets/js/ui/toast.js',
  './assets/js/ui/dialog.js',
  './assets/js/ui/gates.js',
  './assets/js/ui/tabs.js',
  './assets/js/ui/render.js',
  './assets/js/ui/resumo.js',
  './assets/js/ui/entries.js',
  './assets/js/ui/calendar.js',
  './assets/js/ui/params.js',
  './assets/js/ui/goals.js',
  './assets/js/ui/config.js',
  './assets/js/ui/shortcuts.js',
  './assets/js/ui/install.js',
  './assets/fonts/inter-latin-400-normal.woff2',
  './assets/fonts/inter-latin-500-normal.woff2',
  './assets/fonts/inter-latin-600-normal.woff2',
  './assets/fonts/inter-latin-700-normal.woff2',
  './assets/fonts/space-grotesk-latin-500-normal.woff2',
  './assets/fonts/space-grotesk-latin-600-normal.woff2',
  './assets/fonts/space-grotesk-latin-700-normal.woff2',
  './assets/fonts/jetbrains-mono-latin-500-normal.woff2',
  './assets/fonts/jetbrains-mono-latin-600-normal.woff2',
  './vendor/supabase.js',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll é tudo-ou-nada: um 404 derrubaria a instalação inteira. Como o
    // shell é longo, cada item vai individualmente e falhas são toleradas.
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* item indisponível agora; o runtime cache pega depois */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source && event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

function isSameOrigin(url) {
  return new URL(url, self.location.href).origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Supabase, fontes, qualquer coisa de outra origem: o SW não se mete.
  if (req.method !== 'GET' || !isSameOrigin(req.url)) return;

  // Navegação: rede primeiro (para pegar deploy novo), cache como rede de segurança.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('./index.html', preload.clone());
          return preload;
        }
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match('./index.html', { ignoreSearch: true });
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Assets: cache primeiro (abre instantâneo) e revalida em segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: false });
    const network = fetch(req).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(cached ? SHELL_CACHE : RUNTIME_CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    return fresh || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
