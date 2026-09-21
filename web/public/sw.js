/* Service Worker – Hausmeisterdienst HD Terminplanung
 *
 * Zwei Aufgaben:
 *  1. Die App-Hülle offline verfügbar halten, damit ein Mitarbeiter im
 *     Funkloch wenigstens die zuletzt geladenen Termine sieht.
 *  2. Push-Benachrichtigungen anzeigen und den Tipp darauf richtig routen.
 */

const VERSION = 'hd-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Termindaten: erst das Netz, bei Funkloch die letzte Antwort aus dem Cache.
  if (url.pathname.startsWith('/api/')) {
    // Anmeldung und Push nie zwischenspeichern.
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/push/')) return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'Offline – keine gespeicherten Daten vorhanden.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }),
    );
    return;
  }

  // Navigation: erst das Netz, damit neue Versionen sofort ankommen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Statisches Beiwerk (JS, CSS, Schriften): aus dem Cache, sonst laden.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Hausmeisterdienst HD', body: 'Es gibt eine Terminänderung.', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      // Gleiches Tag = eine Meldung ersetzt die vorige, statt den
      // Sperrbildschirm zuzumüllen.
      tag: payload.tag || 'hd-termin',
      renotify: true,
      data: { url: payload.url || '/' },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Ein bereits offenes App-Fenster wird wiederverwendet.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(target).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
