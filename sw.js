/* Service worker PDP Wima — PWA offline.
 *  - Halaman & skrip milik sendiri : "jaringan dulu" (pembaruan kode langsung terlihat); bila jaringan
 *    gagal / lambat (>7 dtk) dipakai salinan cache. Semua halaman disimpan sejak pemasangan pertama.
 *  - Library CDN & font            : "cache dulu, perbarui di latar" (disalin saat pemasangan pertama).
 *  - Data Supabase                 : TIDAK ditangani di sini; disalin oleh pwa-offline.js (IndexedDB).
 * Naikkan VERSI untuk membersihkan cache lama. */
var VERSI = 'pdp-v2';
var LOKAL = [
 "admin.html",
 "akses-guard.js",
 "app-switcher.js",
 "bottomnav.js",
 "bukuinduk-admin.html",
 "bukuinduk-core.js",
 "bukuinduk-fields.js",
 "bukuinduk-guru.html",
 "catatan-pengawas.html",
 "dashboard-kepsek.js",
 "desktopnav.js",
 "developer.html",
 "disiplin-saya.js",
 "disiplin.html",
 "excel-data-rapor.js",
 "excel-rekap.js",
 "foto-profil.js",
 "guru-penugasan.html",
 "guru.html",
 "ijin-notif.js",
 "ijin.html",
 "index.html",
 "jadwal-kegiatan.js",
 "kartu-pelajar.js",
 "kepsek-nav.js",
 "kepsek-readonly.js",
 "kinerja.html",
 "log-admin.html",
 "mobile.js",
 "offline.html",
 "panduan-guru.html",
 "panduan-pdp.html",
 "pdf-cetak.js",
 "pelanggaran-cp.js",
 "pelanggaran.html",
 "pengaduan-siswa.js",
 "pengaduan.html",
 "pengajuan-data.js",
 "pengaturan-admin.html",
 "pengingat-guru.js",
 "pengingat-kepsek.js",
 "riwayat-pengingat.html",
 "pengumuman-kepsek.js",
 "penilaian-rekan.html",
 "penilaian-saya.js",
 "penugasan-admin.html",
 "pkl.html",
 "portal.html",
 "presensi-siswa.html",
 "presensi.html",
 "pwa-offline.js",
 "pwa.js",
 "rpp-launcher.js",
 "sambutan-guru.js",
 "simpan-atas.js",
 "siswa.html",
 "slideshow.css",
 "sticky-nama.js",
 "style.css",
 "supabase-client.js",
 "supervisi-admin.html",
 "supervisi-bank.js",
 "supervisi-excel.js",
 "supervisi-form.js",
 "supervisi-otomatis.js",
 "supervisi-pdf.js",
 "supervisi-ttd.js",
 "supervisi.html",
 "unsaved-guard.js",
 "xlsx-autofit.js",
 "manifest.webmanifest",
 "apple-touch-icon.png",
 "assets/logo.png",
 "assets/logo-kemdikdasmen.png",
 "assets/logo-tutwuri.png",
 "assets/stempel-wima.png",
 "assets/opening/ayu.webp",
 "assets/opening/huda.webp",
 "assets/opening/tick-kiri.webp",
 "assets/opening/tick-kanan.webp",
 "assets/icons/apple-touch-icon.png",
 "assets/icons/favicon-16.png",
 "assets/icons/favicon-32.png",
 "assets/icons/icon-152.png",
 "assets/icons/icon-167.png",
 "assets/icons/icon-192.png",
 "assets/icons/icon-512.png",
 "assets/icons/icon-maskable-512.png"
];
var CDN = [
 "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
 "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
 "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
 "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js",
 "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
 "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
 "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
 "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
 "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
 "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
 "https://unpkg.com/lucide@latest"
];
var FONT_CSS = [
 "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
 "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Lilita+One&display=swap",
 "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&family=Source+Serif+4:wght@600;700&display=swap"
];
var HOST_CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

function simpan(url, res) {
  return caches.open(VERSI).then(function (c) { return c.put(url, res); });
}
function ambilCdn(url) {                       // mode cors -> respons tidak "opaque" (hemat kuota penyimpanan)
  return fetch(url, { mode: 'cors', credentials: 'omit' });
}

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var tugas = [];
    LOKAL.forEach(function (u) {
      tugas.push(fetch(new Request(u, { cache: 'reload' })).then(function (r) {
        if (r.ok && !r.redirected) return simpan(u, r);
      }).catch(function () {}));
    });
    CDN.forEach(function (u) {
      tugas.push(ambilCdn(u).then(function (r) { if (r.ok) return simpan(u, r); }).catch(function () {}));
    });
    FONT_CSS.forEach(function (u) {
      tugas.push(ambilCdn(u).then(async function (r) {
        if (!r.ok) return;
        var salinan = r.clone(), css = await r.text();
        await simpan(u, salinan);
        var berkas = css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s'"]+/g) || [];
        await Promise.all(berkas.map(function (f) {
          return ambilCdn(f).then(function (x) { if (x.ok) return simpan(f, x); }).catch(function () {});
        }));
      }).catch(function () {}));
    });
    await Promise.all(tugas);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSI; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function cariCache(req) {
  return caches.match(req).then(function (hit) {
    return hit || caches.match(req, { ignoreSearch: true });
  }).then(function (hit) {
    if (hit || req.mode !== 'navigate') return hit;
    if (/\/$/.test(new URL(req.url).pathname)) return caches.match('index.html');   // alamat akar -> beranda
    return hit;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  var url = new URL(req.url);

  // ---- CDN & font: cache dulu, perbarui di latar ----
  if (url.origin !== self.location.origin) {
    if (!HOST_CDN.test(req.url)) return;       // Supabase, Google Drive, dll: biarkan browser
    e.respondWith(caches.match(req.url).then(function (hit) {
      var jar = ambilCdn(req.url).then(function (r) {
        if (r && r.ok) { var s = r.clone(); simpan(req.url, s); }
        return r;
      }).catch(function () { return null; });
      if (hit) { e.waitUntil(jar); return hit; }
      return jar.then(function (r) { return r || Response.error(); });
    }));
    return;
  }

  // ---- Milik sendiri: jaringan dulu, cache sebagai cadangan ----
  e.respondWith(new Promise(function (resolve) {
    var selesai = false;
    function pakaiCache() {
      return cariCache(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('offline.html');
        return null;
      });
    }
    var timer = setTimeout(function () {
      pakaiCache().then(function (h) { if (h && !selesai) { selesai = true; resolve(h); } });
    }, 7000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic' && !res.redirected) { var s = res.clone(); simpan(req, s); }
      if (!selesai) { selesai = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      if (selesai) return;
      pakaiCache().then(function (h) { selesai = true; resolve(h || Response.error()); });
    });
  }));
});
