/* pengaduan-siswa.js
 * -----------------------------------------------------------------
 * Menu "Pengaduan" di Portal Siswa (siswa.html): siswa melaporkan
 * bullying / tindak pelanggaran lain. Nama pelapor WAJIB dicantumkan
 * (tidak ada opsi anonim).
 *
 * Aturan privasi ditegakkan di DATABASE (migrasi_pengaduan.sql):
 *   - kirim lewat fungsi  pengaduan_kirim(...)
 *   - baca riwayat lewat view  pengaduan_saya  (hanya milik sendiri)
 *   - nama pelapor tercantum di laporan; hanya Admin dan Kepala Sekolah
 *     yang dapat melihat daftar pengaduan.
 *
 * Memakai global dari siswa.html: content, S, headHtml, kosongHtml,
 * escapeHtml, formatTanggalIndonesia, supabaseClient.
 * Dimuat SETELAH supabase-client.js.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var KATEGORI = [
    { v: 'bullying',      t: 'Perundungan / bullying (ejekan, pengucilan, intimidasi)' },
    { v: 'kekerasan',     t: 'Kekerasan fisik / perkelahian' },
    { v: 'pelecehan',     t: 'Pelecehan / perilaku tidak pantas' },
    { v: 'tata_tertib',   t: 'Pelanggaran tata tertib sekolah' },
    { v: 'narkoba_rokok', t: 'Rokok, vape, miras atau narkoba' },
    { v: 'pencurian',     t: 'Pencurian / perusakan barang' },
    { v: 'lainnya',       t: 'Lainnya' }
  ];
  var STATUS = {
    baru:     { t: 'Terkirim',  c: 'pg-st--baru' },
    diproses: { t: 'Diproses',  c: 'pg-st--proses' },
    selesai:  { t: 'Selesai',   c: 'pg-st--selesai' },
    ditolak:  { t: 'Ditutup',   c: 'pg-st--tutup' }
  };
  var MIN_URAIAN = 15, MAKS_URAIAN = 4000;

  function namaKategori(v) {
    for (var i = 0; i < KATEGORI.length; i++) if (KATEGORI[i].v === v) return KATEGORI[i].t.split(' (')[0];
    return v;
  }

  function pasangGaya() {
    if (document.getElementById('pgStyle')) return;
    var st = document.createElement('style');
    st.id = 'pgStyle';
    st.textContent =
      '.pg-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg,12px);padding:18px 20px;margin-bottom:16px;}' +
      '.pg-aman{display:flex;gap:12px;align-items:flex-start;background:var(--primary-tint,#e7f6ec);border:1px solid var(--primary-soft,#bbf7d0);border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.55;margin-bottom:16px;}' +
      '.pg-aman svg,.pg-aman i{width:20px;height:20px;flex-shrink:0;color:var(--primary-dim,#166534);margin-top:1px;}' +
      '.pg-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;}' +
      '.pg-f{display:flex;flex-direction:column;gap:5px;min-width:0;}' +
      '.pg-f--full{grid-column:1/-1;}' +
      '.pg-f label{font-size:12.5px;font-weight:700;}' +
      '.pg-f label small{font-weight:500;color:var(--ink-soft);}' +
      '.pg-f input,.pg-f select,.pg-f textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:14px;background:var(--surface);color:var(--ink);}' +
      '.pg-f textarea{min-height:130px;resize:vertical;line-height:1.5;}' +
      '.pg-f input:focus,.pg-f select:focus,.pg-f textarea:focus{outline:2px solid var(--primary-soft,#86efac);border-color:var(--primary);}' +
      '.pg-cnt{font-size:11.5px;color:var(--ink-soft);text-align:right;}' +
      '.pg-aksi{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;}' +
      '.pg-darurat{font-size:12.5px;color:var(--ink-soft);margin-top:12px;line-height:1.55;}' +
      '.pg-item{border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:var(--surface);}' +
      '.pg-item__top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;}' +
      '.pg-item__no{font-weight:800;font-size:13px;}' +
      '.pg-item__tgl{font-size:12px;color:var(--ink-soft);margin-left:auto;}' +
      '.pg-item__kat{font-size:13.5px;font-weight:700;}' +
      '.pg-item__teks{font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-top:6px;}' +
      '.pg-item__meta{font-size:12px;color:var(--ink-soft);margin-top:6px;}' +
      '.pg-tgp{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--surface-tint-strong,#f1f5f9);font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}' +
      '.pg-tgp b{display:block;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:2px;}' +
      '.pg-st{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:800;}' +
      '.pg-st--baru{background:#dbeafe;color:#1d4ed8;}.pg-st--proses{background:#fef3c7;color:#b45309;}' +
      '.pg-st--selesai{background:#dcfce7;color:#15803d;}.pg-st--tutup{background:#f1f5f9;color:#475569;}' +
      '.pg-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--surface-tint-strong,#f1f5f9);color:var(--ink-soft);}' +
      '.pg-ok{background:#dcfce7;border:1px solid #86efac;color:#14532d;border-radius:12px;padding:12px 14px;font-size:13.5px;margin-bottom:14px;}' +
      '@media (max-width:640px){.pg-grid{grid-template-columns:1fr;}.pg-item__tgl{margin-left:0;width:100%;}}';
    document.head.appendChild(st);
  }

  function fmtWaktu(iso) {
    try {
      return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');
    } catch (e) { return String(iso || ''); }
  }

  function formHtml() {
    var hariIni = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    return '<div class="pg-box">' +
      '<div class="pg-aman"><i data-lucide="shield-check"></i><div>' +
      '<b>Laporan memuat namamu.</b> Pengaduan akan dikirim atas nama <b>' + escapeHtml((S.siswa && S.siswa.nama) || '') + '</b> agar bisa diverifikasi dan ditindaklanjuti. ' +
      'Laporan hanya dapat dibaca oleh <b>Admin dan Kepala Sekolah</b>, bukan oleh teman sekelas.</div></div>' +
      '<form id="pgForm" novalidate><div class="pg-grid">' +
      '<div class="pg-f pg-f--full"><label for="pgKat">Jenis kejadian</label><select id="pgKat">' +
      '<option value="">— Pilih jenis —</option>' + KATEGORI.map(function (k) { return '<option value="' + k.v + '">' + escapeHtml(k.t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="pg-f"><label for="pgTerlapor">Siapa yang terlibat? <small>(boleh dikosongkan)</small></label><input id="pgTerlapor" type="text" maxlength="200" placeholder="Nama / kelas / ciri-ciri"></div>' +
      '<div class="pg-f"><label for="pgTempat">Di mana kejadiannya? <small>(boleh dikosongkan)</small></label><input id="pgTempat" type="text" maxlength="200" placeholder="Mis. kantin, kelas, media sosial"></div>' +
      '<div class="pg-f"><label for="pgTgl">Kapan kejadiannya? <small>(boleh dikosongkan)</small></label><input id="pgTgl" type="date" max="' + hariIni + '"></div>' +
      '<div class="pg-f pg-f--full"><label for="pgUraian">Ceritakan apa yang terjadi</label>' +
      '<textarea id="pgUraian" maxlength="' + MAKS_URAIAN + '" placeholder="Tulis dengan jelas: apa yang terjadi, siapa saja yang terlibat, sudah berapa lama, dan apa yang kamu rasakan."></textarea>' +
      '<div class="pg-cnt" id="pgCnt">0 / ' + MAKS_URAIAN + '</div></div>' +
      '</div>' +
      '<div class="pg-aksi"><button type="submit" class="btn-small btn-small--primary" id="pgKirim"><i data-lucide="send" style="width:14px;height:14px;"></i> Kirim Pengaduan</button>' +
      '<span class="sw-pesan" id="pgPesan" style="margin:0;"></span></div>' +
      '<div class="pg-darurat"><b>Dalam bahaya sekarang?</b> Jangan menunggu balasan di sini. Segera temui guru atau orang dewasa terdekat.</div>' +
      '</form></div>';
  }

  function itemHtml(r) {
    var st = STATUS[r.status] || STATUS.baru;
    var meta = [];
    if (r.terlapor) meta.push('Terlibat: ' + r.terlapor);
    if (r.tempat) meta.push('Tempat: ' + r.tempat);
    if (r.tanggal_kejadian) meta.push('Kejadian: ' + formatTanggalIndonesia(r.tanggal_kejadian));
    return '<div class="pg-item">' +
      '<div class="pg-item__top"><span class="pg-item__no">#' + escapeHtml(r.nomor) + '</span>' +
      '<span class="pg-st ' + st.c + '">' + st.t + '</span>' +
      '<span class="pg-item__tgl">' + escapeHtml(fmtWaktu(r.dibuat_pada)) + '</span></div>' +
      '<div class="pg-item__kat">' + escapeHtml(namaKategori(r.kategori)) + '</div>' +
      '<div class="pg-item__teks">' + escapeHtml(r.uraian) + '</div>' +
      (meta.length ? '<div class="pg-item__meta">' + escapeHtml(meta.join(' · ')) + '</div>' : '') +
      (r.tanggapan ? '<div class="pg-tgp"><b>Tanggapan sekolah</b>' + escapeHtml(r.tanggapan) + '</div>' : '') +
      '</div>';
  }

  async function muatRiwayat() {
    var area = document.getElementById('pgRiwayat');
    if (!area) return;
    var res = await supabaseClient.from('pengaduan_saya').select('*').order('dibuat_pada', { ascending: false });
    if (!document.getElementById('pgRiwayat')) return;
    if (res.error) {
      var belum = /pengaduan_saya|does not exist|schema cache/i.test(res.error.message || '');
      area.innerHTML = kosongHtml(belum ? 'Fitur belum aktif' : 'Riwayat belum bisa dimuat',
        belum ? 'Fitur pengaduan belum diaktifkan oleh admin sekolah.' : (res.error.message || ''));
      return;
    }
    var rows = res.data || [];
    area.innerHTML = rows.length ? rows.map(itemHtml).join('') :
      '<div class="panel-note">Kamu belum pernah mengirim pengaduan.</div>';
    if (window.lucide) lucide.createIcons();
  }

  function render() {
    pasangGaya();
    content.innerHTML = headHtml('Pengaduan', 'Laporkan bullying atau pelanggaran lain yang kamu alami atau lihat. Sekolah akan menindaklanjutinya.') +
      '<div id="pgNotif"></div>' + formHtml() +
      '<div class="sw-sec-title" style="margin-top:6px;">Riwayat Pengaduanku</div>' +
      '<div id="pgRiwayat" style="margin-top:14px;"><div class="panel-note">Memuat...</div></div>';
    if (window.lucide) lucide.createIcons();

    var ta = document.getElementById('pgUraian');
    var cnt = document.getElementById('pgCnt');
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length + ' / ' + MAKS_URAIAN; });

    document.getElementById('pgForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = document.getElementById('pgKirim');
      var pesan = document.getElementById('pgPesan');
      function tampil(teks, ok) { pesan.textContent = teks; pesan.className = 'sw-pesan ' + (ok ? 'sw-pesan--ok' : 'sw-pesan--err'); pesan.style.margin = '0'; }

      var kat = document.getElementById('pgKat').value;
      var uraian = ta.value.trim();
      if (!kat) { tampil('Pilih jenis kejadian dulu.', false); return; }
      if (uraian.length < MIN_URAIAN) { tampil('Ceritakan kejadiannya sedikit lebih lengkap (minimal ' + MIN_URAIAN + ' karakter).', false); return; }

      var ok = window.confirm('Kirim pengaduan ini atas namamu?');
      if (!ok) return;

      btn.disabled = true;
      tampil('Mengirim...', true);
      var res = await supabaseClient.rpc('pengaduan_kirim', {
        p_kategori: kat,
        p_uraian: uraian,
        p_anonim: false,
        p_terlapor: document.getElementById('pgTerlapor').value || null,
        p_tanggal_kejadian: document.getElementById('pgTgl').value || null,
        p_tempat: document.getElementById('pgTempat').value || null
      });
      btn.disabled = false;
      if (res.error) {
        var m = res.error.message || '';
        if (/pengaduan_kirim|schema cache|does not exist/i.test(m)) m = 'Fitur pengaduan belum diaktifkan oleh admin sekolah.';
        tampil('Gagal mengirim: ' + m, false);
        return;
      }
      try { catatAktivitas('lainnya', 'Pengaduan', 'Mengirim pengaduan'); } catch (x) { /* abaikan */ }
      // Reset form & tampilkan konfirmasi
      ['pgKat', 'pgTerlapor', 'pgTempat', 'pgTgl', 'pgUraian'].forEach(function (id) { document.getElementById(id).value = ''; });
      cnt.textContent = '0 / ' + MAKS_URAIAN;
      tampil('', true);
      document.getElementById('pgNotif').innerHTML = '<div class="pg-ok"><b>Pengaduan terkirim.</b> Terima kasih sudah berani melapor. Kamu bisa memantau statusnya di riwayat di bawah.</div>';
      window.scrollTo(0, 0);
      muatRiwayat();
    });

    muatRiwayat();
  }

  window.PengaduanSiswa = { render: render };
})();
