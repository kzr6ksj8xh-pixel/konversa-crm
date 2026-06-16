const VERSION = 'v7';
const CACHE = 'konversa-' + VERSION;

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => {
      // Notificar a todos los clientes que hay nueva versión
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
      });
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// ── Push Notifications (Nivel 2) ──────────────────────────────────────────────

self.addEventListener('push', e => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: 'Konversa', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Konversa', {
      body: data.body || '',
      icon: data.icon || '/logo_konversa.png',
      badge: data.badge || '/icon-192.png',
      data: { url: data.url || '/', contactId: data.contactId },
      tag: 'konversa-msg-' + (data.contactId || 'general'),
      renotify: true,
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { url, contactId } = e.notification.data || {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Si ya hay una ventana abierta, enfocarla y mandar el contactId
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (contactId) client.postMessage({ type: 'OPEN_CONTACT', contactId });
          return;
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      return clients.openWindow((url || '/') + (contactId ? '#contact=' + contactId : ''));
    })
  );
});

// Renovar suscripción si el servidor la invalida
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => {
        return fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub)
        });
      })
  );
});
