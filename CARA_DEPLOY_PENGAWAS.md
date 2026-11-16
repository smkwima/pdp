# Role Pengawas Sekolah (lihat-saja)

Akun `pengawas` memantau mutu sekolah tanpa bisa mengubah data sekolah. Satu-satunya yang bisa ditulisnya adalah **Catatan Pengawas** miliknya sendiri.

## Yang tampil untuk pengawas
- **Beranda**: kartu progres saja (Nilai E-Rapor, Kinerja Guru, Nilai PKL, Supervisi) + ringkasan jumlah siswa/guru/kelas/mapel.
  Tanpa daftar "Perlu ditindaklanjuti", tombol Ingatkan, riwayat pengingat, dan panel WhatsApp.
- **E-Rapor** (rekap: Ringkasan, Kelas, Mapel, Rekap Nilai) — menu Siswa, Leger, dan Unduh Data Rapor disembunyikan.
- **Guru & Penugasan**, **Nilai PKL** (rekap), **Supervisi** (Jadwal + Hasil), **Kinerja Guru** (lihat saja, tanpa Beri Jempol / Minta Revisi).
- **Catatan Pengawas** (baru): hasil kunjungan, temuan, rekomendasi, tindak lanjut. Bisa tambah/ubah/hapus catatan sendiri, cetak.

## Yang disembunyikan / diblokir
Catatan Pelanggaran, Pengaduan Siswa, Buku Induk (NIK/KK), Ijin & Dinas Luar, Rekap Kedisiplinan, Administrasi (Pengaturan, Log), RPP Maker.
Membuka alamatnya langsung akan dikembalikan ke Beranda. Di database, pengawas tidak diberi hak baca ke tabel-tabelnya.

## Kepala Sekolah
Mendapat menu baru **Catatan Pengawas** (hanya baca). Perilaku lainnya tidak berubah.

## Cara pasang (urutan penting: SQL dulu, baru upload)
1. Supabase → SQL Editor → jalankan **migrasi_pengawas.sql** seluruhnya (aman diulang).
2. Upload ke GitHub Pages (timpa yang lama):
   `catatan-pengawas.html` (baru), `portal.html`, `kepsek-readonly.js`, `kepsek-nav.js`, `dashboard-kepsek.js`,
   `bottomnav.js`, `bukuinduk-core.js`, `admin.html`, `guru-penugasan.html`, `kinerja.html`, `pkl.html`,
   `supervisi-admin.html`, `supervisi.html`, `ijin.html`, `index.html`.
   Semua halaman yang memuat skrip-skrip itu juga ikut diubah nomor versinya (`?v=`) agar browser memuat yang baru,
   jadi upload seluruh file HTML di paket ini.
3. Buat akun: Authentication → Add user (email + sandi). Lalu di Table Editor → `profiles`, isi baris user itu:
   `nama` = nama pengawas, `role` = `pengawas`. (Atau lewat menu admin pembuatan guru lalu ubah `role` di `profiles`.)
4. Muat ulang aplikasi (Ctrl+F5), login sebagai pengawas, dan cek daftar di bawah.

## Daftar cek setelah pasang
- [ ] Beranda menampilkan 4 kartu progres, tanpa tombol Ingatkan.
- [ ] Sidebar hanya: Beranda, E-Rapor, Guru & Penugasan, Nilai PKL, Supervisi, Kinerja Guru, Catatan Pengawas.
- [ ] Buka `pelanggaran.html`, `pengaduan.html`, `bukuinduk-admin.html`, `ijin.html` → kembali ke Beranda.
- [ ] Kinerja Guru: tidak ada tombol Beri Jempol / Minta Revisi.
- [ ] Catatan Pengawas: tambah, ubah, hapus catatan; login Kepala Sekolah bisa membacanya tapi tidak ada tombol tulis.
- [ ] Pemeriksaan keamanan: di SQL Editor jalankan query terakhir di `migrasi_pengawas.sql` (bagian 5) → hasilnya harus kosong.

## Catatan
- Hak baca pengawas ditentukan oleh daftar tabel di bagian 3 `migrasi_pengawas.sql`. Kalau ada halaman yang kosong/galat
  ("permission denied"), tambahkan tabelnya ke daftar itu dan jalankan ulang. Jangan menambah `bi_siswa_detail`, tabel pelanggaran, atau pengaduan.
- Menu E-Rapor yang disembunyikan (Siswa, Leger, Unduh Data Rapor) disembunyikan di tampilan. Untuk E-Rapor, tabel `siswa` dan `nilai`
  tetap bisa dibaca di database karena rekap kelengkapan membutuhkannya; NIK/KK ada di `bi_siswa_detail` yang tidak dibuka.
- Berkas bukti kinerja (bucket Storage `bukti-kinerja`) memakai aturan storage sendiri. Bila tautan bukti tidak bisa dibuka pengawas,
  tambahkan policy SELECT untuk `public.is_pengawas()` pada bucket itu.
- Pengawas tidak menerima/mengirim pengingat dan tidak memakai Ijin & Dinas Luar.
