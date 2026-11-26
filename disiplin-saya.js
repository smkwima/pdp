/* disiplin-saya.js
 * -----------------------------------------------------------------
 * KARTU "PREDIKAT KEDISIPLINAN" di Menu Utama (portal.html) untuk guru & staf.
 *
 *   Ada DUA kartu predikat kedisiplinan:
 *     - (Finger) : dari rekap fingerprint yang disimpan admin   -> DisiplinSaya.kartu()
 *     - (Online) : dari presensi online (selfie + lokasi) bulan  -> DisiplinSaya.kartuOnline()
 *   Admin bisa menyembunyikan/menampilkan tiap kartu dari menu "Predikat Guru & Staf"
 *   (tabel kartu_predikat_pengaturan) -> DisiplinSaya.pengaturan().
 *
 *   - Kartu menampilkan predikat (Sangat Baik / Baik / Cukup / Kurang) dari
 *     rekap absen terbaru yang disimpan admin.
 *   - Kartu bisa diklik -> jendela rekapan: Tidak hadir (alpa), Terlambat,
 *     Pulang lebih cepat, Ijin, Sakit, Dinas luar. Bisa pilih rekap/periode lain.
 *
 * Data hanya milik akun yang login. Diambil lewat Edge Function
 * rekap-disiplin (aksi "saya"); server mencocokkan lewat Kode Mesin.
 *
 * Pakai:  DisiplinSaya.kartu()  -> string HTML kartu (taruh di grid kartu)
 *         DisiplinSaya.muat()   -> mengisi kartu (panggil setelah kartu ada di halaman)
 * Dimuat setelah supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.DisiplinSaya) return;

  var PRED = { 'Sangat Baik': 'sangat-baik', 'Baik': 'baik', 'Cukup': 'cukup', 'Kurang': 'kurang' };
  var KET = {
    'Sangat Baik': 'Tidak ada tidak hadir, terlambat, pulang cepat, atau kurang scan.',
    'Baik': 'Tidak pernah tidak hadir, terlambat paling banyak 25% hari terjadwal.',
    'Cukup': 'Tidak hadir paling banyak 25% hari terjadwal.',
    'Kurang': 'Tidak hadir di atas 25% hari terjadwal.'
  };
  var ITEM = [
    { k: 'alpa', t: 'Tidak Hadir (Alpa)', c: 'merah', i: 'user-x' },
    { k: 'terlambat', t: 'Terlambat', c: 'oranye', i: 'alarm-clock' },
    { k: 'pulang_awal', t: 'Pulang Lebih Cepat', c: 'oranye', i: 'log-out' },
    { k: 'ijin', t: 'Ijin', c: 'biru', i: 'file-text' },
    { k: 'sakit', t: 'Sakit', c: 'biru', i: 'thermometer' },
    { k: 'dinas_luar', t: 'Dinas Luar', c: 'biru', i: 'briefcase' }
  ];
  var S = { daftar: [], rekap: null, data: null, kolomHilang: [], alasan: null, galat: '', siap: false };

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ikon() { if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) { /* abaikan */ } } }
  function tglId(s) {
    if (!s) return '';
    var d = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s);
    return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function periode(r) { return r ? tglId(r.periode_awal) + ' – ' + tglId(r.periode_akhir) : ''; }

  function pasangGaya() {
    if (document.getElementById('dsStyle')) return;
    var st = document.createElement('style');
    st.id = 'dsStyle';
    st.textContent =
      '.ds-pil { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; max-width: 100%; padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.16); color: #fff; font: 600 13px/1.3 var(--font-body); text-align: left; cursor: pointer; transition: background .15s, transform .15s; }' +
      '.ds-pil:hover { background: rgba(255,255,255,.26); transform: translateY(-1px); }' +
      '.ds-pil:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }' +
      '.ds-pil svg, .ds-pil i { width: 16px; height: 16px; flex-shrink: 0; }' +
      '.ds-pil__l { color: #dbeafe; } .ds-pil b { font-weight: 800; color: #fff; }' +
      '.ds-pil .ds-p--sangat-baik { color: #a7f3d0; } .ds-pil .ds-p--baik { color: #bfdbfe; } .ds-pil .ds-p--cukup { color: #fde68a; } .ds-pil .ds-p--kurang { color: #fecaca; }' +
      '.ds-pil .ds-pil__a { width: 14px; height: 14px; opacity: .7; }' +
      '@media (max-width: 860px) { .ds-pil { width: 100%; justify-content: flex-start; font-size: 12.5px; padding: 9px 12px; border-radius: 14px; } .ds-pil .ds-pil__a { margin-left: auto; } }' +
      '.pt-stat--klik { width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s; }' +
      '.pt-stat--klik:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--primary-soft); }' +
      '.pt-stat--klik:focus-visible { outline: 3px solid var(--primary-soft); outline-offset: 2px; }' +
      '.pt-stat__s { font-size: 11px; color: var(--ink-faint); margin-top: 2px; }' +
      '.ds-p--sangat-baik { color: #047857; } .ds-p--baik { color: #1d4ed8; } .ds-p--cukup { color: #b45309; } .ds-p--kurang { color: #b91c1c; }' +
      '.ds-ov { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,.55); }' +
      '.ds-box { width: 100%; max-width: 560px; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--surface); border-radius: 18px; box-shadow: 0 24px 60px rgba(15,23,42,.35); }' +
      '.ds-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; }' +
      '.ds-head h3 { margin: 0; font-family: var(--font-display); font-size: 17px; font-weight: 800; letter-spacing: -.01em; }' +
      '.ds-head p { margin: 3px 0 0; font-size: 12px; color: var(--ink-soft); }' +
      '.ds-x { border: 0; background: var(--surface-tint-strong); color: var(--ink-soft); width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }' +
      '.ds-x:hover { color: var(--danger); background: var(--danger-tint); }' +
      '.ds-body { padding: 0 20px 20px; }' +
      '.ds-sel { width: 100%; margin-bottom: 14px; padding: 9px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: 600 12.5px var(--font-body); background: var(--surface); color: var(--ink); }' +
      '.ds-pred { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; margin-bottom: 14px; border: 1px solid transparent; }' +
      '.ds-pred--sangat-baik { background: #ecfdf5; border-color: #a7f3d0; } .ds-pred--baik { background: #eff6ff; border-color: #bfdbfe; }' +
      '.ds-pred--cukup { background: #fffbeb; border-color: #fde68a; } .ds-pred--kurang { background: #fef2f2; border-color: #fecaca; }' +
      '.ds-pred--none { background: var(--surface-tint-strong); border-color: var(--border); }' +
      '.ds-pred__l { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); }' +
      '.ds-pred__v { font-family: var(--font-display); font-size: 22px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; }' +
      '.ds-pred__k { font-size: 12px; color: var(--ink-soft); margin-top: 2px; line-height: 1.45; }' +
      '.ds-sub { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); margin: 14px 0 8px; }' +
      '.ds-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }' +
      '.ds-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }' +
      '.ds-it { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; padding: 12px 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }' +
      '.ds-it__ic { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }' +
      '.ds-it__ic i, .ds-it__ic svg { width: 17px; height: 17px; }' +
      '.ds-it__n { font-family: var(--font-display); font-size: 24px; font-weight: 800; line-height: 1.1; }' +
      '.ds-it__l { font-size: 11.5px; font-weight: 600; color: var(--ink-soft); line-height: 1.3; }' +
      '.ds-note { margin-top: 14px; padding: 10px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; background: var(--surface-tint); border: 1px solid var(--border); color: var(--ink-soft); }' +
      '.ds-warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }' +
      '.ds-err { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }' +
      '@media (max-width: 480px) { .ds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }';
    document.head.appendChild(st);
  }

  async function panggil(isi) {
    var ses = await supabaseClient.auth.getSession();
    var token = ses.data && ses.data.session ? ses.data.session.access_token : null;
    if (!token) throw new Error('Sesi habis. Silakan login ulang.');
    var resp;
    try {
      resp = await fetch(SUPABASE_URL + '/functions/v1/rekap-disiplin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify(Object.assign({ aksi: 'saya' }, isi || {}))
      });
    } catch (e) { throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.'); }
    var out = await resp.json().catch(function () { return {}; });
    if (resp.status === 404 && !out.error) throw new Error('Fitur ini belum diaktifkan. Minta admin men-deploy ulang Edge Function rekap-disiplin.');
    if (!resp.ok || !out.success) {
      if (resp.status === 403) throw new Error('Edge Function rekap-disiplin masih versi lama. Minta admin men-deploy ulang.');
      throw new Error(out.error || ('HTTP ' + resp.status));
    }
    return out;
  }

  function terapkan(out) {
    S.daftar = out.daftar || []; S.rekap = out.rekap || null; S.data = out.data || null;
    S.kolomHilang = out.kolom_hilang || []; S.kunci = out.kunci_tersedia || []; S.alasan = out.alasan || null; S.galat = '';
  }

  // ---------- kartu ----------
  function kartu() {
    pasangGaya();
    return '<button type="button" class="ds-pil" id="dsKartu" aria-haspopup="dialog" title="Klik untuk melihat rekap kehadiran">' +
      '<i data-lucide="shield-check"></i><span class="ds-pil__l">Predikat Kedisiplinan (Finger) :</span> <b id="dsKartuNilai">…</b>' +
      '<i data-lucide="chevron-right" class="ds-pil__a"></i></button>';
  }
  function isiKartu() {
    var v = document.getElementById('dsKartuNilai');
    if (!v) return;
    var p = S.data && S.data.predikat;
    v.className = PRED[p] ? 'ds-p--' + PRED[p] : '';
    if (!PRED[p] || S.galat) v.className = '';
    v.textContent = (!S.galat && PRED[p]) ? p : (S.galat ? '—' : 'Belum ada');
  }

  // ---------- jendela rekapan ----------
  function tutup() { var o = document.getElementById('dsOv'); if (o) o.remove(); document.removeEventListener('keydown', tekan); }
  function tekan(e) { if (e.key === 'Escape') tutup(); }

  function isiJendela() {
    var o = document.getElementById('dsOv'); if (!o) return;
    var p = S.data && S.data.predikat, kls = PRED[p] || 'none';
    var opsi = S.daftar.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (S.rekap && String(x.id) === String(S.rekap.id) ? ' selected' : '') + '>' + esc(x.judul) + ' (' + esc(periode(x)) + ')</option>';
    }).join('');
    var pesan = '';
    if (S.galat) pesan = '<div class="ds-note ds-err">' + esc(S.galat) + '</div>';
    else if (S.alasan === 'belum_ada_rekap') pesan = '<div class="ds-note">Belum ada rekap kehadiran yang disimpan admin. Rekap muncul di sini setelah admin menekan <b>Simpan rekap</b> di Rekap Absen.</div>';
    else if (S.alasan === 'kode_mesin_kosong') pesan = '<div class="ds-note ds-warn">Kode Mesin (No.ID fingerprint) akunmu belum diisi, sehingga datamu tidak bisa dicocokkan. Hubungi admin.</div>';
    else if (S.alasan === 'tidak_ditemukan') pesan = '<div class="ds-note ds-warn">Namamu tidak ada pada rekap yang dipilih. Coba pilih periode lain, atau hubungi admin.</div>';

    function tile(it) {
      var v = S.data ? S.data[it.k] : null;
      var hilang = v === null || v === undefined;
      return '<div class="ds-it"><div class="ds-it__ic c-' + it.c + '"><i data-lucide="' + it.i + '"></i></div>' +
        '<div class="ds-it__n"' + (!hilang && v > 0 && it.c !== 'biru' ? ' style="color:' + (it.c === 'merah' ? '#b91c1c' : '#b45309') + '"' : '') + '>' + (hilang ? '–' : v) + '</div>' +
        '<div class="ds-it__l">' + it.t + '</div></div>';
    }
    var hilangTxt = S.data && S.kolomHilang.length
      ? '<div class="ds-note ds-warn">Sebagian angka belum terbaca dari rekap ini (ditampilkan “–”). Minta admin menekan <b>Simpan rekap</b> ulang di Rekap Absen.' +
        (S.kunci && S.kunci.length ? '<br><span style="opacity:.75">Kolom yang tersedia: ' + esc(S.kunci.join(', ')) + '</span>' : '') + '</div>' : '';

    o.querySelector('.ds-body').innerHTML =
      (S.daftar.length > 1 ? '<select class="ds-sel" id="dsPilih" aria-label="Pilih rekap">' + opsi + '</select>' : '') +
      pesan +
      (S.data
        ? '<div class="ds-pred ds-pred--' + kls + '"><div><div class="ds-pred__l">Predikat Kedisiplinan (Finger)</div>' +
          '<div class="ds-pred__v ds-p--' + (PRED[p] || '') + '">' + esc(p && p !== '–' ? p : 'Belum ada jadwal') + '</div>' +
          (KET[p] ? '<div class="ds-pred__k">' + KET[p] + '</div>' : '') + '</div></div>' +
          '<div class="ds-sub">Kehadiran</div><div class="ds-grid">' + ITEM.slice(0, 3).map(tile).join('') + '</div>' +
          '<div class="ds-sub">Ijin / Sakit / Dinas Luar</div><div class="ds-grid">' + ITEM.slice(3).map(tile).join('') + '</div>' +
          hilangTxt +
          '<div class="ds-note">Angka = jumlah hari/kali pada periode rekap. Ijin, sakit, dan dinas luar hanya yang sudah disetujui admin.</div>'
        : '') +
      '';
    var sel = document.getElementById('dsPilih');
    if (sel) sel.addEventListener('change', async function () {
      o.querySelector('.ds-body').innerHTML = '<div class="ds-note">Memuat…</div>';
      try { terapkan(await panggil({ id: sel.value })); } catch (e) { S.galat = e.message || String(e); }
      isiJendela(); isiKartu();
    });
    var sub = o.querySelector('.ds-head p'); if (sub) sub.textContent = S.rekap ? S.rekap.judul + ' · ' + periode(S.rekap) : 'Rekap kehadiran fingerprint';
    ikon();
  }

  function buka() {
    pasangGaya();
    if (document.getElementById('dsOv')) return;
    var o = document.createElement('div');
    o.className = 'ds-ov'; o.id = 'dsOv'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Rekap kedisiplinan');
    o.innerHTML = '<div class="ds-box"><div class="ds-head"><div><h3>Rekap Kedisiplinan Saya</h3><p></p></div>' +
      '<button type="button" class="ds-x" id="dsTutup" aria-label="Tutup"><i data-lucide="x" style="width:16px;height:16px;"></i></button></div>' +
      '<div class="ds-body"><div class="ds-note">Memuat…</div></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) tutup(); });
    document.getElementById('dsTutup').addEventListener('click', tutup);
    document.addEventListener('keydown', tekan);
    ikon();
    if (S.siap) isiJendela();
    else muatData().then(function () { isiJendela(); });
  }

  async function muatData() {
    try { terapkan(await panggil({})); } catch (e) { S.galat = e.message || String(e); }
    S.siap = true;
    isiKartu();
  }

  async function muat() {
    var k = document.getElementById('dsKartu');
    if (k && !k.dataset.ds) { k.dataset.ds = '1'; k.addEventListener('click', buka); }
    await muatData();
  }

  // =====================================================================
  // PENGATURAN: kartu mana yang tampil (diatur admin di menu "Predikat Guru & Staf")
  // Bawaan semuanya tampil; bila tabel belum ada / gagal dibaca, tetap tampil.
  // =====================================================================
  var PENG = null;
  function pengaturan() {
    if (PENG) return PENG;
    PENG = (async function () {
      var bawaan = { finger: true, online: true, rekan: true };
      try {
        var r = await supabaseClient.from('kartu_predikat_pengaturan').select('tampil_finger, tampil_online, tampil_rekan').eq('id', 1).maybeSingle();
        if (r.error || !r.data) return bawaan;
        return { finger: r.data.tampil_finger !== false, online: r.data.tampil_online !== false, rekan: r.data.tampil_rekan !== false };
      } catch (e) { return bawaan; }
    })();
    return PENG;
  }

  // =====================================================================
  // KARTU "PREDIKAT KEDISIPLINAN (ONLINE)" - dari presensi online bulan berjalan
  // Sumber: Edge Function presensi-api, aksi "rekap_bulanan" (guru/staf hanya mendapat data dirinya sendiri).
  // Aturan predikat sama dengan rekap fingerprint & tab Rekap Bulanan di Presensi.
  // =====================================================================
  var API_ONLINE = 'https://nrwexyezcbmsokelgkmp.supabase.co/functions/v1/presensi-api';
  var KET_ON = {
    'Sangat Baik': 'Tidak ada tanpa keterangan, terlambat, pulang lebih awal, atau kurang absen pulang.',
    'Baik': 'Tidak pernah tanpa keterangan, terlambat paling banyak 25% hari kerja.',
    'Cukup': 'Tanpa keterangan paling banyak 25% hari kerja.',
    'Kurang': 'Tanpa keterangan di atas 25% hari kerja.'
  };
  var ITEM_ON_A = [
    { k: 'kerja', t: 'Hari Kerja', c: 'biru', i: 'calendar-days' },
    { k: 'telat', t: 'Terlambat', c: 'oranye', i: 'alarm-clock' },
    { k: 'pulang_awal', t: 'Pulang Lebih Awal', c: 'oranye', i: 'log-out' },
    { k: 'tap', t: 'Kurang Absen Pulang', c: 'oranye', i: 'clock-alert' },
    { k: 'tanpa_ket', t: 'Tanpa Keterangan', c: 'merah', i: 'user-x' },
    { k: 'tugas_luar', t: 'Tugas Luar', c: 'biru', i: 'briefcase' }
  ];
  var ITEM_ON_B = [
    { k: 'ijin', t: 'Ijin', c: 'biru', i: 'file-text' },
    { k: 'sakit', t: 'Sakit', c: 'biru', i: 'thermometer' },
    { k: 'dinas_luar', t: 'Dinas Luar', c: 'biru', i: 'briefcase' }
  ];
  var BLN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var O = { bulan: '', data: null, ijinOk: true, galat: '', siap: false };

  function bulanIni() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7); }
  function namaBulan(b) { return b ? (BLN[parseInt(b.slice(5), 10)] || '') + ' ' + b.slice(0, 4) : ''; }

  async function panggilOnline(bulan) {
    var ses = await supabaseClient.auth.getSession();
    var token = ses.data && ses.data.session ? ses.data.session.access_token : null;
    var uid = ses.data && ses.data.session && ses.data.session.user ? ses.data.session.user.id : null;
    if (!token || !uid) throw new Error('Sesi habis. Silakan login ulang.');
    var resp;
    try {
      resp = await fetch(API_ONLINE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rapor-token': token },
        body: JSON.stringify({ action: 'rekap_bulanan', bulan: bulan })
      });
    } catch (e) { throw new Error('Tidak bisa terhubung ke server presensi. Periksa koneksi internet.'); }
    var out = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      if (resp.status === 403 || /action tidak dikenal/i.test(out.error || '')) throw new Error('Fungsi presensi-api di server masih versi lama. Minta admin men-deploy ulang presensi-api.ts (folder presensi-backend).');
      throw new Error(out.error || ('HTTP ' + resp.status));
    }
    var h = out.hasil || {};
    var kunci = Object.keys(h);
    return { data: h[uid] || (kunci.length === 1 ? h[kunci[0]] : null), ijinOk: out.ijin_ok !== false };
  }

  async function muatOnline(bulan) {
    O.bulan = bulan || bulanIni();
    try { var r = await panggilOnline(O.bulan); O.data = r.data; O.ijinOk = r.ijinOk; O.galat = ''; }
    catch (e) { O.data = null; O.galat = e.message || String(e); }
    O.siap = true;
  }

  function kartuOnline() {
    pasangGaya();
    return '<button type="button" class="ds-pil" id="dsKartuOn" aria-haspopup="dialog" title="Klik untuk melihat rekap presensi online">' +
      '<i data-lucide="map-pin"></i><span class="ds-pil__l">Predikat Kedisiplinan (Online) :</span> <b id="dsKartuOnNilai">…</b>' +
      '<i data-lucide="chevron-right" class="ds-pil__a"></i></button>';
  }
  function isiKartuOnline() {
    var v = document.getElementById('dsKartuOnNilai'); if (!v) return;
    var p = O.data && O.data.predikat;
    v.className = (!O.galat && PRED[p]) ? 'ds-p--' + PRED[p] : '';
    v.textContent = (!O.galat && PRED[p]) ? p : (O.galat ? '—' : 'Belum ada');
  }

  function tutupOnline() { var o = document.getElementById('dsOvOn'); if (o) o.remove(); document.removeEventListener('keydown', tekanOnline); }
  function tekanOnline(e) { if (e.key === 'Escape') tutupOnline(); }

  function isiJendelaOnline() {
    var o = document.getElementById('dsOvOn'); if (!o) return;
    var d = O.data, p = d && d.predikat, kls = PRED[p] || 'none';
    function tile(it) {
      var v = d ? d[it.k] : null, hilang = v === null || v === undefined;
      var warna = (!hilang && v > 0 && it.c !== 'biru') ? ' style="color:' + (it.c === 'merah' ? '#b91c1c' : '#b45309') + '"' : '';
      return '<div class="ds-it"><div class="ds-it__ic c-' + it.c + '"><i data-lucide="' + it.i + '"></i></div>' +
        '<div class="ds-it__n"' + warna + '>' + (hilang ? '–' : v) + '</div><div class="ds-it__l">' + it.t + '</div></div>';
    }
    var pesan = '';
    if (O.galat) pesan = '<div class="ds-note ds-err">' + esc(O.galat) + '</div>';
    else if (!d) pesan = '<div class="ds-note">Belum ada data presensi online untuk bulan ini.</div>';
    else if (!O.ijinOk) pesan = '<div class="ds-note ds-warn">Data ijin/sakit/dinas luar belum terbaca, jadi bisa tampil sebagai Tanpa Keterangan. Hubungi admin.</div>';

    o.querySelector('.ds-body').innerHTML =
      '<input type="month" class="ds-sel" id="dsBulanOn" value="' + esc(O.bulan) + '" max="' + bulanIni() + '" aria-label="Pilih bulan">' +
      pesan +
      (d
        ? '<div class="ds-pred ds-pred--' + kls + '"><div><div class="ds-pred__l">Predikat Kedisiplinan (Online)</div>' +
          '<div class="ds-pred__v ds-p--' + (PRED[p] || '') + '">' + esc(p && p !== '–' ? p : 'Belum ada jadwal') + '</div>' +
          (KET_ON[p] ? '<div class="ds-pred__k">' + KET_ON[p] + '</div>' : '') + '</div></div>' +
          '<div class="ds-sub">Kehadiran</div><div class="ds-grid">' + ITEM_ON_A.map(tile).join('') + '</div>' +
          '<div class="ds-sub">Ijin / Sakit / Dinas Luar</div><div class="ds-grid">' + ITEM_ON_B.map(tile).join('') + '</div>' +
          '<div class="ds-note">Total waktu terlambat ' + (d.menit_telat || 0) + ' menit, pulang lebih awal ' + (d.menit_pulang_awal || 0) + ' menit. ' +
          'Dihitung dari presensi online (selfie + lokasi) pada hari kerja menurut jadwal sampai hari ini. Ijin, sakit, dan dinas luar hanya yang sudah disetujui admin.</div>'
        : '');
    var sel = document.getElementById('dsBulanOn');
    if (sel) sel.addEventListener('change', async function () {
      if (!sel.value) return;
      o.querySelector('.ds-body').innerHTML = '<div class="ds-note">Memuat…</div>';
      await muatOnline(sel.value); isiJendelaOnline(); isiKartuOnline();
    });
    var sub = o.querySelector('.ds-head p'); if (sub) sub.textContent = 'Presensi online · ' + namaBulan(O.bulan);
    ikon();
  }

  function bukaOnline() {
    pasangGaya();
    if (document.getElementById('dsOvOn')) return;
    var o = document.createElement('div');
    o.className = 'ds-ov'; o.id = 'dsOvOn'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Rekap kedisiplinan online');
    o.innerHTML = '<div class="ds-box"><div class="ds-head"><div><h3>Kedisiplinan Online Saya</h3><p></p></div>' +
      '<button type="button" class="ds-x" id="dsTutupOn" aria-label="Tutup"><i data-lucide="x" style="width:16px;height:16px;"></i></button></div>' +
      '<div class="ds-body"><div class="ds-note">Memuat…</div></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) tutupOnline(); });
    document.getElementById('dsTutupOn').addEventListener('click', tutupOnline);
    document.addEventListener('keydown', tekanOnline);
    ikon();
    if (O.siap) isiJendelaOnline();
    else muatOnline(O.bulan).then(function () { isiJendelaOnline(); isiKartuOnline(); });
  }

  async function muatKartuOnline() {
    var k = document.getElementById('dsKartuOn');
    if (k && !k.dataset.ds) { k.dataset.ds = '1'; k.addEventListener('click', bukaOnline); }
    await muatOnline(bulanIni());
    isiKartuOnline();
  }

  window.DisiplinSaya = { kartu: kartu, muat: muat, kartuOnline: kartuOnline, muatOnline: muatKartuOnline, pengaturan: pengaturan };
})();
