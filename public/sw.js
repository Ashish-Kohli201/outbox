self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Outbox', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [80, 40, 80], data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin);
  e.waitUntil((async () => {
    if (url.origin !== self.location.origin) return self.clients.openWindow(url.href); // e.g. LinkedIn search
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate(url.href); }
    return self.clients.openWindow(url.href);
  })());
});
