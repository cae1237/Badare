/* Badare CRM — Service Worker (PWA)
   Estratégia: network-first para o app (sempre pega a versão mais nova
   quando online; usa cache só offline). Dados do Supabase nunca são
   cacheados (sempre rede). */
const CACHE = 'badare-v9';
const SHELL = ['./','index.html','app.js','auth.js','db.js','config.js','data.js','manifest.json','icon.svg','icon-192.png','icon-512.png','icon-512-maskable.png','apple-touch-icon.png','assets/logo-icon.svg','assets/logo-horizontal.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(()=>self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // dados sempre na rede
  e.respondWith(
    fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
