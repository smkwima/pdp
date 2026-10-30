/* kepsek-readonly.js
 * -----------------------------------------------------------------
 * MODE LIHAT-SAJA untuk akun Kepala Sekolah (profiles.role = 'kepsek').
 *
 * Dipasang di halaman yang memakai tampilan admin (admin.html,
 * bukuinduk-admin.html, pkl.html, supervisi-admin.html). Untuk role
 * lain skrip ini tidak melakukan apa-apa.
 *
 * Dua lapis pengaman:
 *   1. DATABASE (utama): role kepsek hanya punya policy SELECT
 *      (lihat migrasi_role_kepsek.sql), jadi tulis data pasti ditolak.
 *   2. TAMPILAN (skrip ini): semua perintah tulis dari browser dicegat
 *      dengan pesan ramah, dan tombol Simpan/Tambah/Hapus/Edit dll
 *      disembunyikan. Cetak, unduh Excel/PDF tetap bisa dipakai.
 *
 * Harus dimuat SETELAH supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (typeof supabaseClient === 'undefined') return;

  var PESAN = 'Akun Kepala Sekolah hanya dapat melihat data.';
  // Fungsi database (rpc) yang MENULIS data. catat_aktivitas & fungsi baca tetap boleh.
  var RPC_TULIS = /^(admin_reset|ajukan|batalkan|hapus|proses|supervisi_isi|buat|reset|sinkron)/i;
  // Teks tombol yang berarti mengubah data.
  var AKSI = /^[^a-z]*(simpan|tambah|tambahkan|hapus|edit|ubah|import|impor|unggah|upload|reset|buat|terbitkan|batalkan|naikkan|luluskan|setujui|tolak|kirim|isi otomatis|sinkron|sync|aktifkan|nonaktifkan|pindahkan|mutasi|ganti|tetapkan|tunjuk|catat|tugaskan|kelola)/i;
  // Tombol penginputan massal (import / unggah / template) — disembunyikan walau mengandung kata "Excel".
  var INPUT_DATA = /^[^a-z]*(import|impor|unggah|upload)|template/i;
  var BUKAN_AKSI = /pdf|excel|xlsx|cetak|print|unduh|download|pratinjau|lihat/i;
  var IKON_TULIS = '[data-lucide="trash-2"],[data-lucide="trash"],[data-lucide="pencil"],[data-lucide="edit"],[data-lucide="square-pen"],[data-lucide="save"],[data-lucide="plus"],[data-lucide="user-plus"],[data-lucide="upload"],' +
    'svg.lucide-trash-2,svg.lucide-trash,svg.lucide-pencil,svg.lucide-edit,svg.lucide-square-pen,svg.lucide-save,svg.lucide-plus,svg.lucide-user-plus,svg.lucide-upload';

  var terakhirToast = 0;
  function toast() {
    var kini = Date.now();
    if (kini - terakhirToast < 3000) return;
    terakhirToast = kini;
    var el = document.createElement('div');
    el.textContent = PESAN;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:9999;background:#1f2937;color:#fff;' +
      'padding:10px 16px;border-radius:10px;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  // Objek tiruan yang bisa di-chain (.select().single() dst) dan di-await;
  // hasilnya selalu { data:null, error:{...} } seperti ditolak RLS.
  function tolak() {
    toast();
    var hasil = { data: null, error: { message: PESAN, code: 'KEPSEK_READONLY' }, count: null, status: 403, statusText: 'Forbidden' };
    var p = Promise.resolve(hasil);
    var prox;
    prox = new Proxy(function () {}, {
      get: function (_, k) {
        if (k === 'then') return function (a, b) { return p.then(a, b); };
        if (k === 'catch') return function (b) { return p.catch(b); };
        if (k === 'finally') return function (f) { return p.finally(f); };
        return function () { return prox; };
      },
      apply: function () { return prox; }
    });
    return prox;
  }

  function bungkusGetter(nama, bungkus) {
    try {
      var proto = Object.getPrototypeOf(supabaseClient);
      var d = Object.getOwnPropertyDescriptor(proto, nama);
      if (!d || !d.get) return;
      Object.defineProperty(supabaseClient, nama, {
        configurable: true,
        get: function () { return bungkus(d.get.call(supabaseClient)); }
      });
    } catch (e) { /* abaikan */ }
  }

  function pasangPengaman() {
    // Tabel: insert / update / delete / upsert
    var asalFrom = supabaseClient.from.bind(supabaseClient);
    supabaseClient.from = function (t) {
      var q = asalFrom(t);
      ['insert', 'update', 'delete', 'upsert'].forEach(function (m) { q[m] = tolak; });
      return q;
    };
    // Fungsi database yang menulis
    var asalRpc = supabaseClient.rpc.bind(supabaseClient);
    supabaseClient.rpc = function (nama, args, opsi) {
      if (RPC_TULIS.test(String(nama))) return tolak();
      return asalRpc(nama, args, opsi);
    };
    // Storage (hanya bucket foto-guru = foto profil sendiri yang diizinkan)
    bungkusGetter('storage', function (st) {
      var asal = st.from.bind(st);
      st.from = function (bucket) {
        var b = asal(bucket);
        if (String(bucket) !== 'foto-guru') {
          ['upload', 'update', 'remove', 'move', 'copy'].forEach(function (m) { b[m] = tolak; });
        }
        return b;
      };
      return st;
    });
    // Edge function (mis. buat akun guru)
    bungkusGetter('functions', function (fn) { fn.invoke = tolak; return fn; });
  }

  // ---------- tampilan ----------
  function pasangLencana() {
    if (document.getElementById('kroBadge')) return;
    var st = document.createElement('style');
    st.textContent =
      '#kroBadge{position:fixed;left:12px;bottom:12px;z-index:60;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;' +
      'border-radius:999px;padding:6px 12px;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.12);pointer-events:none;}' +
      '@media screen and (max-width:860px){#kroBadge{bottom:76px;}}' +
      '[data-kepsek-hidden]{display:none !important;}' +
      'body.kepsek-ro .add-form,body.kepsek-ro input[type="file"]{display:none !important;}' +
      'body.kepsek-ro .fp-av.fp-klik{pointer-events:none;cursor:default;}';
    document.head.appendChild(st);
    var b = document.createElement('div');
    b.id = 'kroBadge';
    b.textContent = 'Mode Kepala Sekolah';
    document.body.appendChild(b);
  }

  function sembunyikanTombolTulis(akar) {
    var daftar = (akar || document).querySelectorAll('button, a.btn, a.btn-small, input[type="button"], input[type="submit"], [role="button"]');
    for (var i = 0; i < daftar.length; i++) {
      var el = daftar[i];
      if (el.hasAttribute('data-kepsek-hidden') || el.id === 'logoutBtn') continue;
      // Edit profil SENDIRI (foto + data diri) tetap boleh: avatar/tautan "Edit Profil" & jendelanya.
      if (el.hasAttribute('data-profil-saya') || (el.closest && el.closest('.fp-ov'))) continue;
      var teks = ((el.innerText || el.value || '') + '').trim();
      var label = (teks + ' ' + (el.title || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();
      var tulis = false;
      if (el.hasAttribute('data-foto-id')) tulis = true; // tombol Foto (ubah foto guru)
      else if (INPUT_DATA.test(label)) tulis = true;
      else if (BUKAN_AKSI.test(label)) tulis = false;
      else if (AKSI.test(teks) || AKSI.test(el.title || '')) tulis = true;
      else if (!teks && el.querySelector(IKON_TULIS)) tulis = true; // tombol ikon saja (tong sampah, pensil, dst)
      if (tulis) el.setAttribute('data-kepsek-hidden', '1');
    }
  }

  // Ganti label "Admin" di sidebar & chip pengguna menjadi "Kepala Sekolah".
  function gantiLabelRole() {
    var chip = document.querySelectorAll('.user-chip__role');
    for (var i = 0; i < chip.length; i++) {
      if (/^\s*admin\s*$/i.test(chip[i].textContent)) chip[i].textContent = 'Kepala Sekolah';
    }
    var sb = document.querySelectorAll('.sidebar__role');
    for (var j = 0; j < sb.length; j++) {
      var t = sb[j].lastChild;
      if (t && t.nodeType === 3) t.textContent = t.textContent.replace(/Panel Admin|Admin\s+/i, function (m) { return /Panel/i.test(m) ? 'Panel Kepala Sekolah' : ''; });
    }
  }

  // ---------- menu sidebar: tampilkan hanya yang perlu kepala sekolah ----------
  // Menu yang disembunyikan = menu pengaturan/penginputan/administrasi (kepsek hanya memantau).
  var MENU_SEMBUNYI = {
    'admin.html': {
      view: ['guru', 'penugasan', 'mapel', 'waliKelas', 'mapelTingkat', 'urutanLeger', 'kokurikuler', 'ekskul', 'tujuanPembelajaran', 'terbitRapor', 'tarikBukuInduk'],
      href: ['pengaturan-admin.html', 'log-admin.html']
    },
    'bukuinduk-admin.html': { view: ['pengajuan', 'sinkron', 'excel'], href: [] },
    'supervisi-admin.html': { view: ['form', 'data'], href: [] },
    'pkl.html': { view: [], href: [] }
  };

  function sembunyikanMenu() {
    var berkas = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var cfg = MENU_SEMBUNYI[berkas];
    if (!cfg) return;
    var nav = document.querySelector('.menu-list');
    if (!nav) return;
    var items = nav.querySelectorAll('.menu-item');
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      var v = a.getAttribute('data-view');
      var h = (a.getAttribute('href') || '').toLowerCase();
      if ((v && cfg.view.indexOf(v) >= 0) || (h && cfg.href.indexOf(h) >= 0)) a.setAttribute('data-kepsek-hidden', '1');
    }
    // Sembunyikan judul grup yang semua menunya sudah tersembunyi.
    var anak = nav.children, label = null, adaIsi = false;
    function tutup() { if (label && !adaIsi) label.setAttribute('data-kepsek-hidden', '1'); }
    for (var j = 0; j < anak.length; j++) {
      var el = anak[j];
      if (el.classList.contains('sidebar__section-label')) {
        tutup(); label = el; adaIsi = false;
      } else if (el.classList.contains('menu-item') && !el.hasAttribute('data-kepsek-hidden')) {
        adaIsi = true;
      }
    }
    tutup();
  }


  // ---------- sembunyikan semua perangkat penginputan data ----------
  // Form tambah data, input file, kolom centang (hapus massal), kolom aksi kosong, catatan format import.
  function tampilKosong(td) {
    var c = td.cloneNode(true);
    var h = c.querySelectorAll('[data-kepsek-hidden]');
    for (var i = 0; i < h.length; i++) h[i].remove();
    return c.textContent.trim() === '' && !c.querySelector('input,select,textarea,img,svg,canvas');
  }

  function sembunyikanPenginputan() {
    var tabel = document.querySelectorAll('table.data-table:not(.pt-table)');
    for (var t = 0; t < tabel.length; t++) {
      var tb = tabel[t];
      var thr = tb.querySelector('thead tr');
      if (!thr || tb.querySelectorAll('thead tr').length !== 1) continue;
      var ths = thr.children;
      var rows = tb.querySelectorAll('tbody tr');
      for (var i = 0; i < ths.length; i++) {
        var th = ths[i];
        var sembunyi = false;
        if (th.querySelector('input[type="checkbox"]')) sembunyi = true;
        else if (/^\s*mengajar/i.test(th.textContent)) sembunyi = true; // daftar Mapel — Kelas di menu Guru
        else if (th.textContent.trim() === '') {
          var adaIsi = false, adaBaris = false;
          for (var r = 0; r < rows.length; r++) {
            var kids = rows[r].children;
            if (kids.length !== ths.length) continue; // baris "belum ada data" (colspan)
            adaBaris = true;
            if (!tampilKosong(kids[i])) { adaIsi = true; break; }
          }
          sembunyi = adaBaris && !adaIsi;
        }
        if (!sembunyi) continue;
        th.setAttribute('data-kepsek-hidden', '1');
        for (var r2 = 0; r2 < rows.length; r2++) {
          var k2 = rows[r2].children;
          if (k2.length === ths.length) k2[i].setAttribute('data-kepsek-hidden', '1');
        }
      }
    }
    // Toolbar yang semua tombolnya sudah tersembunyi
    var tools = document.querySelectorAll('.toolbar');
    for (var q = 0; q < tools.length; q++) {
      var anak = tools[q].children, tampak = false;
      for (var a = 0; a < anak.length; a++) {
        var e = anak[a];
        if (e.hasAttribute('data-kepsek-hidden') || e.type === 'file' || e.style.display === 'none') continue;
        tampak = true; break;
      }
      if (anak.length && !tampak) tools[q].setAttribute('data-kepsek-hidden', '1');
    }
    // Catatan petunjuk format import / cara menambah data
    var notes = document.querySelectorAll('.panel-note');
    for (var n = 0; n < notes.length; n++) {
      if (/import|template|tambahkan|jalankan\s/i.test(notes[n].textContent)) notes[n].setAttribute('data-kepsek-hidden', '1');
    }
  }

  // Dashboard -> Ringkasan
  function gantiNamaDashboard() {
    var m = document.querySelectorAll('.menu-item[data-view="dashboard"] .menu-item__title');
    for (var i = 0; i < m.length; i++) if (m[i].textContent.trim() === 'Dashboard') m[i].textContent = 'Ringkasan';
    var jd = document.querySelectorAll('.panel-head__title');
    for (var j = 0; j < jd.length; j++) if (jd[j].textContent.trim() === 'Dashboard') jd[j].textContent = 'Ringkasan';
    if (document.title) document.title = document.title.replace(/Dashboard Admin/, 'Ringkasan');
  }

  function jagaTampilan() {
    document.body.classList.add('kepsek-ro');
    window.__kepsekMode = true;
    sembunyikanMenu();
    pasangLencana();
    sembunyikanTombolTulis();
    sembunyikanPenginputan();
    gantiNamaDashboard();
    gantiLabelRole();
    var jadwal = false;
    new MutationObserver(function () {
      if (jadwal) return;
      jadwal = true;
      requestAnimationFrame(function () { jadwal = false; sembunyikanTombolTulis(); sembunyikanPenginputan(); gantiNamaDashboard(); gantiLabelRole(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- deteksi role ----------
  async function adalahKepsek() {
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return false;
      var kunci = 'kepsek_ro_' + user.id;
      var cache = null;
      try { cache = sessionStorage.getItem(kunci); } catch (e) { /* abaikan */ }
      if (cache !== null) return cache === '1';
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var ya = !!(pr && pr.data && pr.data.role === 'kepsek');
      try { sessionStorage.setItem(kunci, ya ? '1' : '0'); } catch (e) { /* abaikan */ }
      return ya;
    } catch (e) {
      return false;
    }
  }

  // Petunjuk role terakhir (dibagi dengan kepsek-nav.js) supaya menu & tombol tulis
  // langsung disembunyikan saat halaman dibuka, tanpa kedip menunggu cek role.
  var HINT = 'kepsek_hint';
  function adaHint() { try { return localStorage.getItem(HINT) === '1'; } catch (e) { return false; } }

  var sudahRO = false;
  function aktifkanRO() {
    if (sudahRO || !document.body) return;
    sudahRO = true;
    pasangPengaman();
    jagaTampilan();
  }

  // Dengan petunjuk role, pasang begitu topbar terbaca (sebelum frame pertama digambar).
  if (adaHint()) {
    var moAwal = new MutationObserver(function () {
      if (sudahRO) { moAwal.disconnect(); return; }
      if (document.body && document.querySelector('.main > .topbar')) { aktifkanRO(); moAwal.disconnect(); }
    });
    moAwal.observe(document, { childList: true, subtree: true });
  }

  function mulai() {
    var hint = adaHint();
    if (hint) aktifkanRO();
    adalahKepsek().then(function (ya) {
      if (!ya) { try { localStorage.removeItem(HINT); } catch (e) { /* abaikan */ } return; }
      try { localStorage.setItem(HINT, '1'); } catch (e) { /* abaikan */ }
      aktifkanRO();
    });
  }
  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
