/* print-patch.js — disuntikkan HANYA oleh aplikasi Windows (main.js / preload.js).
 * Mengganti SEMUA jalur cetak menjadi "simpan PDF langsung":
 *   - window.print() di halaman utama
 *   - window.open(...) lalu w.print()  (jendela cetak/pratinjau; patch dipasang seketika saat dibuka)
 *   - iframe.contentWindow.print()     (iframe cetak tersembunyi)
 * Versi web di browser tidak menyentuh file ini. */
(function () {
  'use strict';
  if (window.__pdpPrintInstalled) return;
  window.__pdpPrintInstalled = true;

  // Elemen yang TIDAK boleh ikut tercetak: indikator online, toast aplikasi, tombol "Menu Utama",
  // serta ikon/pop-up notifikasi. (Halaman bisa menambah penanda: data-pdp-noprint)
  var BUANG = [
    '#pdpNet', '#pdpToast', '#pdpKembali', '[data-pdp-noprint]',
    '#toast', '.toast', '.toast-container', '#toastContainer', '.snackbar', '.swal2-container',
    '#notif', '.notif', '.notification', '.notifikasi', '#notifBell', '.notif-bell', '.notif-badge',
    '[id^="notif"]', '[class*="notif-"]'
  ].join(',');

  var GENERIK = /^(|about:blank|untitled|tanpa judul|dokumen|document|cetak|print|preview|pratinjau|menyiapkan cetak.*|memuat.*|loading.*|portal data dan penilaian)$/i;

  function bersih(t) {
    return String(t || '').replace(/\s*[—–|-]\s*PORTAL DATA DAN PENILAIAN.*$/i, '').replace(/\s+/g, ' ').trim();
  }

  // Nama dokumen: (1) penanda eksplisit, (2) <title> yang bermakna, (3) judul/heading isi dokumen
  // (+ judul halaman induk bila dokumen dicetak dari jendela/iframe lain).
  function judul(doc) {
    var meta = doc.querySelector('meta[name="pdf-filename"]');
    if (meta && meta.getAttribute('content')) return bersih(meta.getAttribute('content'));
    var dn = doc.querySelector('[data-pdf-name]');
    if (dn && dn.getAttribute('data-pdf-name')) return bersih(dn.getAttribute('data-pdf-name'));

    var t = bersih(doc.title);
    if (t && !GENERIK.test(t)) return t;

    var h = '', sel = ['h1', 'h2', '.judul', '.title', '.doc-title', '.kop-judul', 'h3'];
    for (var i = 0; i < sel.length && !h; i++) {
      var els = doc.querySelectorAll(sel[i]);
      for (var k = 0; k < els.length; k++) {
        var x = bersih(els[k].textContent);
        if (x.length >= 3 && x.length <= 100) { h = x; break; }
      }
    }
    var p = '';
    try { if (doc !== window.document) p = bersih(window.document.title); } catch (e) {}
    if (p && GENERIK.test(p)) p = '';
    if (p && h && h.toLowerCase().indexOf(p.toLowerCase()) < 0) return p + ' - ' + h;
    return h || p || '';
  }

  function snapshot(win) {
    var doc = win.document;
    try { win.dispatchEvent(new win.Event('beforeprint')); } catch (e) {}
    var d = doc.documentElement.cloneNode(true);
    Array.prototype.forEach.call(d.querySelectorAll('script,base'), function (n) { n.remove(); });

    // nilai isian form
    var ai = doc.querySelectorAll('input,textarea,select'), ci = d.querySelectorAll('input,textarea,select');
    for (var i = 0; i < ai.length && i < ci.length; i++) {
      var a = ai[i], c = ci[i], t = (a.type || '').toLowerCase();
      if (a.tagName === 'TEXTAREA') c.textContent = a.value;
      else if (a.tagName === 'SELECT') Array.prototype.forEach.call(c.options, function (o, k) { if (a.options[k] && a.options[k].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      else if (t === 'checkbox' || t === 'radio') { if (a.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
      else c.setAttribute('value', a.value);
    }
    // canvas -> gambar
    var av = doc.querySelectorAll('canvas'), cv = d.querySelectorAll('canvas');
    for (var j = 0; j < av.length && j < cv.length; j++) {
      try { var im = doc.createElement('img'); im.src = av[j].toDataURL('image/png'); im.style.cssText = av[j].style.cssText; im.width = av[j].width; im.height = av[j].height; cv[j].replaceWith(im); } catch (e) {}
    }
    // buang indikator online / toast / notifikasi dari salinan
    try { Array.prototype.forEach.call(d.querySelectorAll(BUANG), function (n) { n.remove(); }); } catch (e) {}

    var head = d.querySelector('head');
    if (head) {
      var st = doc.createElement('style');
      st.textContent = '@media print{' + BUANG + '{display:none!important}}';
      head.appendChild(st);
      var b = doc.createElement('base'); b.href = 'app://pdp/'; head.insertBefore(b, head.firstChild);
    }
    return { title: judul(doc), html: '<!DOCTYPE html>' + d.outerHTML };
  }

  function jembatan(win) {
    var c = [win, window, window.parent, window.opener, window.top];
    try { c.push(win.parent, win.opener); } catch (e) {}
    for (var i = 0; i < c.length; i++) {
      try { if (c[i] && typeof c[i].__pdpCetak === 'function') return c[i].__pdpCetak; } catch (e) {}
    }
    return null;
  }

  function pasang(win) {
    try {
      if (!win || win.__pdpPrintPatched) return;
      win.__pdpPrintPatched = true;
      var asli = win.print;
      win.print = function () {
        var br = jembatan(win);
        if (!br) { if (asli) asli.call(win); return; }     // tanpa jembatan: jangan diam saja
        try {
          var snap = snapshot(win);
          br(snap);
          try { win.dispatchEvent(new win.Event('afterprint')); } catch (e) {}
        } catch (err) {
          console.error('Gagal menyiapkan PDF', err);
          try { win.alert('Gagal menyiapkan PDF: ' + err.message); } catch (e) {}
        }
      };
    } catch (e) {}
  }

  pasang(window);

  // Jendela cetak (window.open): w.print() sering dipanggil seketika — patch harus terpasang sebelum itu.
  var asliOpen = window.open;
  window.open = function () {
    var w = asliOpen.apply(window, arguments);
    pasang(w);
    return w;
  };

  // iframe cetak: patch dipasang setiap kali contentWindow diakses.
  try {
    var dsc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (dsc && dsc.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true, enumerable: dsc.enumerable,
        get: function () { var w = dsc.get.call(this); pasang(w); return w; }
      });
    }
  } catch (e) {}
})();
