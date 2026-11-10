/* pengingat-kepsek.js
 * -----------------------------------------------------------------
 * PENGIRIM PENGINGAT khusus Kepala Sekolah (admin tidak bisa). Dipakai di
 * dashboard progres guru: tombol "Ingatkan" membuka dialog, lalu
 * pengingat muncul di lonceng notifikasi guru (pengingat-guru.js).
 *
 * Harus dimuat SETELAH supabase-client.js. Contoh:
 *
 *   Pengingat.buka({
 *     modul: 'erapor',                    // erapor | kinerja | pkl | supervisi | bukuinduk | umum
 *     judul: 'Nilai rapor belum lengkap', // bisa diubah pengirim di dialog
 *     tautan: 'guru.html',                // halaman tujuan saat guru mengetuk notifikasi
 *     penerima: [{ id: guruId, nama: 'Nama Guru', pesan: 'rincian progres guru ini' }],
 *     onSelesai: function (hasil) { ... } // hasil = { terkirim: n, gagal: n }
 *   });
 *
 *   Pengingat.riwayat('erapor')  -> Promise<{ [guruId]: { dibuat_pada, dibaca_pada } }>
 *   Pengingat.waktuRelatif(iso)  -> 'x jam lalu'
 *
 * Penulisan ke database lewat fungsi pengingat_kirim (migrasi_pengingat.sql)
 * yang memeriksa role (hanya kepsek) di sisi server. Di tampilan, tombol
 * "Ingatkan" disembunyikan untuk selain kepala sekolah. Elemen dialog diberi data-kepsek-ok
 * supaya tidak ikut disembunyikan kepsek-readonly.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.Pengingat) return;

  var MAKS_CHIP = 6;

  // ---------- hanya Kepala Sekolah ----------
  // Petunjuk role (dibagi dengan kepsek-nav.js / kepsek-readonly.js) agar tombol
  // langsung benar saat halaman dibuka; lalu diverifikasi ke database.
  var HINT = 'kepsek_hint';
  var adalahKepsekSekarang = false;
  try { adalahKepsekSekarang = localStorage.getItem(HINT) === '1'; } catch (e) { /* abaikan */ }

  function setKelasKepsek(ya) {
    adalahKepsekSekarang = !!ya;
    if (document.body) document.body.classList.toggle('pk-kepsek', !!ya);
  }
  function pasangKelasAwal() { setKelasKepsek(adalahKepsekSekarang); }

  async function cekRole() {
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) { setKelasKepsek(false); return; }
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var ya = !!(pr && pr.data && pr.data.role === 'kepsek');
      setKelasKepsek(ya);
      try { if (ya) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch (e) { /* abaikan */ }
    } catch (e) { /* biarkan sesuai petunjuk terakhir */ }
  }

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function waktuRelatif(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var d = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (d < 60) return 'baru saja';
    if (d < 3600) return Math.floor(d / 60) + ' menit lalu';
    if (d < 86400) return Math.floor(d / 3600) + ' jam lalu';
    if (d < 86400 * 7) return Math.floor(d / 86400) + ' hari lalu';
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }

  // Pengingat terakhir per guru untuk satu modul. Gagal/tabel belum ada -> {}.
  async function riwayat(modul) {
    var hasil = {};
    try {
      var r = await supabaseClient.from('pengingat_guru')
        .select('guru_id, dibuat_pada, dibaca_pada')
        .eq('modul', modul).order('dibuat_pada', { ascending: false }).limit(1000);
      if (r.error || !r.data) return hasil;
      r.data.forEach(function (x) { if (!hasil[x.guru_id]) hasil[x.guru_id] = { dibuat_pada: x.dibuat_pada, dibaca_pada: x.dibaca_pada }; });
    } catch (e) { /* abaikan */ }
    return hasil;
  }

  // Teks kecil "Diingatkan 2 jam lalu · sudah dibaca" untuk ditempel di baris guru.
  function labelRiwayat(info) {
    if (!info) return '';
    return 'Diingatkan ' + waktuRelatif(info.dibuat_pada) + (info.dibaca_pada ? ' · sudah dibaca' : ' · belum dibaca');
  }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('pkStyle')) return;
    var st = document.createElement('style');
    st.id = 'pkStyle';
    st.textContent =
      '.pk-ov{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '.pk-box{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#fff);color:var(--ink,#1f2937);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.35);}' +
      '.pk-h{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border,#e5e7eb);}' +
      '.pk-h b{font-size:16px;}' +
      '.pk-x{margin-left:auto;border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--ink-soft,#6b7280);padding:2px 8px;border-radius:8px;}' +
      '.pk-b{padding:16px 18px;display:grid;gap:14px;}' +
      '.pk-l{display:block;font-size:12.5px;font-weight:700;margin-bottom:5px;}' +
      '.pk-l small{font-weight:500;color:var(--ink-soft,#6b7280);}' +
      '.pk-in,.pk-ta{width:100%;box-sizing:border-box;border:1px solid var(--border,#d1d5db);border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;background:var(--surface,#fff);color:inherit;}' +
      '.pk-ta{min-height:84px;resize:vertical;line-height:1.5;}' +
      '.pk-chips{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.pk-chip{font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(37,99,235,.10);color:#1d4ed8;}' +
      '.pk-chip--lain{background:rgba(0,0,0,.07);color:var(--ink-soft,#4b5563);}' +
      '.pk-pre{border:1px dashed var(--border,#d1d5db);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55;white-space:pre-line;background:rgba(0,0,0,.025);max-height:170px;overflow:auto;}' +
      '.pk-note{font-size:12.5px;color:var(--ink-soft,#6b7280);line-height:1.5;}' +
      '.pk-err{display:none;font-size:12.5px;line-height:1.5;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:9px 11px;}' +
      '.pk-f{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid var(--border,#e5e7eb);}' +
      '.pk-btn{border:1px solid var(--border,#d1d5db);background:var(--surface,#fff);color:inherit;border-radius:10px;padding:9px 16px;font:600 13.5px system-ui,sans-serif;cursor:pointer;}' +
      '.pk-btn--p{background:var(--primary,#2563eb);border-color:var(--primary,#2563eb);color:#fff;}' +
      '.pk-btn:disabled{opacity:.6;cursor:default;}' +
      '.pk-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:300;background:#14532d;color:#fff;padding:10px 16px;border-radius:10px;' +
      'font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;}' +
      '.pk-btn-ingat{display:none !important;}' +
      'body.pk-kepsek .pk-btn-ingat{display:inline-flex !important;}' +
      '.pk-btn-ingat{align-items:center;gap:4px;white-space:nowrap;font-size:12px !important;padding:4px 9px !important;line-height:1.2;}' +
      '.pk-btn-ingat i,.pk-btn-ingat svg{display:inline-block;width:12px !important;height:12px !important;flex:none;stroke-width:2.2;}' +
      '.pk-diingat{display:block;font-size:11.5px;font-weight:500;color:var(--ink-soft,#6b7280);margin-top:2px;}';
    document.head.appendChild(st);
  }

  function toast(teks) {
    var el = document.createElement('div');
    el.className = 'pk-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('data-kepsek-ok', '1');
    el.textContent = teks;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function tautanAman(t) {
    return (typeof t === 'string' && /^[a-z0-9_\-]+\.html(#[a-z0-9_\-]*)?$/i.test(t)) ? t : null;
  }

  // ---------- dialog ----------
  function buka(opsi) {
    opsi = opsi || {};
    if (!adalahKepsekSekarang) { toast('Pengingat hanya dapat dikirim oleh Kepala Sekolah.'); return; }
    var penerima = (opsi.penerima || []).filter(function (p) { return p && p.id; });
    if (!penerima.length) { toast('Tidak ada guru yang perlu diingatkan.'); return; }
    pasangGaya();

    var banyak = penerima.length > 1;
    var chips = penerima.slice(0, MAKS_CHIP).map(function (p) { return '<span class="pk-chip">' + esc(p.nama || 'Guru') + '</span>'; }).join('') +
      (penerima.length > MAKS_CHIP ? '<span class="pk-chip pk-chip--lain">+' + (penerima.length - MAKS_CHIP) + ' guru lainnya</span>' : '');

    var rincian = banyak
      ? '<div class="pk-note">Rincian progres tiap guru (mapel, kelas, dan jumlah nilai yang belum terisi) ditambahkan otomatis ke pesan masing-masing guru.</div>'
      : (penerima[0].pesan ? '<div><span class="pk-l">Rincian yang dikirim</span><div class="pk-pre">' + esc(penerima[0].pesan) + '</div></div>' : '');

    var ov = document.createElement('div');
    ov.className = 'pk-ov';
    ov.setAttribute('data-kepsek-ok', '1');
    ov.innerHTML =
      '<div class="pk-box" role="dialog" aria-modal="true" aria-labelledby="pkJudulDlg">' +
      '<div class="pk-h"><span aria-hidden="true">🔔</span><b id="pkJudulDlg">Kirim pengingat</b><button type="button" class="pk-x" aria-label="Tutup" data-pk-tutup>&times;</button></div>' +
      '<div class="pk-b">' +
      '<div><span class="pk-l">Penerima (' + penerima.length + ')</span><div class="pk-chips">' + chips + '</div></div>' +
      '<div><label class="pk-l" for="pkJudul">Judul</label><input class="pk-in" id="pkJudul" maxlength="120" value="' + esc(opsi.judul || 'Pengingat dari Kepala Sekolah') + '"></div>' +
      rincian +
      '<div><label class="pk-l" for="pkCatatan">Catatan dari Kepala Sekolah <small>(opsional)</small></label>' +
      '<textarea class="pk-ta" id="pkCatatan" maxlength="500" placeholder="Mis. Mohon dilengkapi paling lambat hari Jumat."></textarea></div>' +
      '<div class="pk-err" id="pkErr" role="alert"></div>' +
      '</div>' +
      '<div class="pk-f"><button type="button" class="pk-btn" data-pk-tutup>Batal</button>' +
      '<button type="button" class="pk-btn pk-btn--p" id="pkKirim">Kirim pengingat</button></div></div>';
    document.body.appendChild(ov);

    var judulEl = ov.querySelector('#pkJudul'), catEl = ov.querySelector('#pkCatatan'), errEl = ov.querySelector('#pkErr'), kirimEl = ov.querySelector('#pkKirim');
    var sibuk = false;

    function tutup() { if (sibuk) return; document.removeEventListener('keydown', onKey); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape') tutup(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) tutup(); });
    ov.querySelectorAll('[data-pk-tutup]').forEach(function (b) { b.addEventListener('click', tutup); });
    setTimeout(function () { catEl.focus(); }, 30);

    function tampilGalat(teks) { errEl.textContent = teks; errEl.style.display = 'block'; }

    kirimEl.addEventListener('click', async function () {
      var judul = judulEl.value.trim();
      if (!judul) { judulEl.focus(); tampilGalat('Judul pengingat wajib diisi.'); return; }
      var catatan = catEl.value.trim();
      sibuk = true; kirimEl.disabled = true; kirimEl.textContent = 'Mengirim…'; errEl.style.display = 'none';

      var galat = null, terkirim = 0, gagal = 0;
      await Promise.all(penerima.map(async function (p) {
        var pesan = [p.pesan || '', catatan ? 'Catatan Kepala Sekolah: ' + catatan : ''].filter(Boolean).join('\n\n');
        try {
          var r = await supabaseClient.rpc('pengingat_kirim', {
            p_guru_id: p.id, p_modul: opsi.modul || 'umum', p_judul: judul, p_pesan: pesan || null, p_tautan: tautanAman(opsi.tautan)
          });
          if (r.error) { gagal++; galat = galat || r.error; } else if (r.data === 1) terkirim++; else gagal++;
        } catch (e) { gagal++; galat = galat || e; }
      }));

      sibuk = false;
      if (terkirim === 0) {
        kirimEl.disabled = false; kirimEl.textContent = 'Coba lagi';
        var m = galat && galat.message ? String(galat.message) : '';
        tampilGalat(/pengingat_kirim|does not exist|schema cache|pengingat_guru/i.test(m)
          ? 'Fitur pengingat belum aktif di database. Jalankan migrasi_pengingat.sql di Supabase SQL Editor.'
          : (m || 'Pengingat gagal dikirim. Coba lagi.'));
        return;
      }
      tutup();
      toast(terkirim === 1 ? 'Pengingat terkirim ke ' + (penerima[0].nama || 'guru') + '.' : 'Pengingat terkirim ke ' + terkirim + ' guru' + (gagal ? ' (' + gagal + ' gagal)' : '') + '.');
      if (typeof opsi.onSelesai === 'function') { try { opsi.onSelesai({ terkirim: terkirim, gagal: gagal }); } catch (e) { /* abaikan */ } }
    });
  }

  // Tombol siap pakai (HTML). Beri data-ingat sebagai penanda untuk event delegation.
  function tombolHtml(atribut, teks) {
    return '<button type="button" class="btn-small pk-btn-ingat" data-kepsek-ok="1" ' + (atribut || '') + '><i data-lucide="bell-ring"></i>' + esc(teks || 'Ingatkan') + '</button>';
  }

  // Pasang gaya sejak awal supaya ikon tombol sudah kecil sebelum dialog pernah dibuka.
  if (document.head) pasangGaya(); else document.addEventListener('DOMContentLoaded', pasangGaya);

  if (document.body) { pasangKelasAwal(); cekRole(); }
  else document.addEventListener('DOMContentLoaded', function () { pasangKelasAwal(); cekRole(); });

  window.Pengingat = { buka: buka, riwayat: riwayat, labelRiwayat: labelRiwayat, waktuRelatif: waktuRelatif, tombolHtml: tombolHtml };
})();
