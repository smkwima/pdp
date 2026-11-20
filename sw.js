/* Service worker PDP Wima — hanya agar aplikasi bisa DIPASANG (PWA) dan
 * menampilkan halaman cadangan saat offline. Data (Supabase) tidak pernah
 * disimpan: semua permintaan lintas-domain & non-GET diteruskan apa adanya.
 * Aset milik sendiri memakai "jaringan dulu, cache sebagai cadangan" agar
 * pembaruan kode langsung terlihat. Naikkan VERSI untuk membersihkan cache. */
var VERSI = 'pdp-v1';
var PRACACHE = ['offline.html', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSI).then(function (c) { return c.addAll(PRACACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSI; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, CDN, font: biarkan browser
  if (req.headers.has('range')) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var salin = res.clone();
        caches.open(VERSI).then(function (c) { c.put(req, salin); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('offline.html');
        return Response.error();
      });
    })
  );
});
