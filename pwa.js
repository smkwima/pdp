/* pwa.js — pendaftaran service worker + ajakan "Pasang Aplikasi".
 * Android/Chrome/Edge : tombol pasang bawaan lewat beforeinstallprompt.
 * iPhone/iPad (Safari): panduan "Bagikan -> Tambah ke Layar Utama"
 *                       (iOS tidak punya tombol pasang otomatis).
 * Spanduk hanya muncul di halaman Masuk & Portal, bisa ditutup, dan tidak
 * muncul bila sudah terpasang atau di dalam aplikasi APK / desktop. */
(function () {
  'use strict';
  var http = location.protocol === 'https:' || location.hostname === 'localhost';

  if (http && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  function simpan(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function baca(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var ua = navigator.userAgent || '';
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var dalamApp = /\bwv\b|Electron/i.test(ua);
  var iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var safariIOS = iOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/i.test(ua);
  var halaman = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var tampilkanDiSini = halaman === '' || halaman === 'index.html' || halaman === 'portal.html';

  // Navigasi tengah-bawah (Sebelumnya · Muat Ulang · Berikutnya) untuk tampilan desktop, di semua halaman.
  // Tidak dimuat di aplikasi Windows/APK (sudah punya toolbar sendiri).
  if (!dalamApp && !document.getElementById('desktopNavScript')) {
    var sn = document.createElement('script');
    sn.id = 'desktopNavScript';
    sn.src = 'desktopnav.js?v=1';
    document.head.appendChild(sn);
  }

  if (!http || standalone || dalamApp || !tampilkanDiSini) return;
  if (baca('pwa-tutup') && Date.now() - Number(baca('pwa-tutup')) < 7 * 864e5) return;

  var tunda = null;

  function css() {
    if (document.getElementById('pwaCss')) return;
    var s = document.createElement('style'); s.id = 'pwaCss';
    s.textContent =
      '.pwa-bar{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:10000;max-width:460px;margin:0 auto;' +
      'display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:#0b2b4f;color:#f1f5f9;' +
      'box-shadow:0 10px 30px rgba(2,12,40,.45);font:500 13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '.pwa-bar img{width:44px;height:44px;border-radius:11px;flex:none}' +
      '.pwa-bar .t{flex:1;min-width:0}.pwa-bar b{display:block;font-size:14px}' +
      '.pwa-bar button{border:0;border-radius:10px;font:600 13px system-ui,sans-serif;cursor:pointer}' +
      '.pwa-bar .pasang{background:#2563eb;color:#fff;padding:9px 14px}' +
      '.pwa-bar .tutup{background:transparent;color:#94a3b8;padding:6px 8px;font-size:18px;line-height:1}' +
      '.pwa-ios{display:inline-block;vertical-align:-3px;width:16px;height:16px}';
    document.head.appendChild(s);
  }

  var IKON_BAGIKAN = '<svg class="pwa-ios" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';

  function bar(isi, tombol) {
    if (document.getElementById('pwaBar')) return;
    css();
    var d = document.createElement('div'); d.className = 'pwa-bar'; d.id = 'pwaBar'; d.setAttribute('role', 'dialog');
    d.innerHTML = '<img src="assets/icons/icon-192.png" alt=""><div class="t">' + isi + '</div>' + (tombol || '') +
      '<button class="tutup" aria-label="Tutup" type="button">&times;</button>';
    d.querySelector('.tutup').onclick = function () { simpan('pwa-tutup', String(Date.now())); d.remove(); };
    document.body.appendChild(d);
    return d;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); tunda = e;
    var d = bar('<b>Pasang aplikasi PDP Wima</b>Akses lebih cepat dari layar utama.', '<button class="pasang" type="button">Pasang</button>');
    if (!d) return;
    d.querySelector('.pasang').onclick = function () {
      d.remove(); tunda.prompt();
      tunda.userChoice.then(function () { tunda = null; });
    };
  });

  window.addEventListener('appinstalled', function () {
    var d = document.getElementById('pwaBar'); if (d) d.remove();
  });

  if (safariIOS) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        bar('<b>Pasang di iPhone / iPad</b>Ketuk ' + IKON_BAGIKAN + ' <b style="display:inline">Bagikan</b>, lalu pilih <b style="display:inline">Tambah ke Layar Utama</b>.');
      }, 1500);
    });
  } else if (iOS) {
    window.addEventListener('load', function () {
      setTimeout(function () { bar('<b>Pasang di iPhone / iPad</b>Buka halaman ini di <b style="display:inline">Safari</b>, lalu pilih Bagikan &rarr; Tambah ke Layar Utama.'); }, 1500);
    });
  }
})();
