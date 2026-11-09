# Pengingat dari Kepala Sekolah → Notifikasi Guru

## Cara pasang
1. Buka **Supabase → SQL Editor**, jalankan isi `migrasi_pengingat.sql` (aman diulang).
2. Opsional tapi disarankan: pastikan **Database → Replication** mengaktifkan tabel `pengingat_guru`
   (skrip sudah mencoba menambahkannya). Tanpa realtime, lonceng guru tetap diperbarui tiap 60 detik.
3. Unggah semua berkas (ikut: `pengingat-guru.js`, `pengingat-kepsek.js`, `kepsek-readonly.js`,
   `admin.html`, `kinerja.html`, `style.css`, serta halaman guru yang kini memuat `pengingat-guru.js`).

## Cara pakai
- **Kepala Sekolah / admin**: Dashboard E-Rapor → tombol **Ingatkan** di
  *Perlu perhatian*, di tiap guru, di kartu wali kelas, atau **Ingatkan semua yang belum selesai**.
  Di *Kinerja Guru* → tombol Ingatkan pada tabel ringkasan guru.
  Rincian progres terisi otomatis; kepsek bisa menambah catatan.
- **Guru**: ikon lonceng di kanan bawah (semua halaman guru). Badge merah = belum dibaca,
  muncul juga pesan singkat saat ada pengingat baru. Mengetuk pengingat membuka halaman terkait.

## Catatan
- Pengingat yang belum dibaca dengan modul + judul sama **diperbarui**, bukan ditumpuk.
- Penulisan hanya lewat fungsi `pengingat_kirim` (cek role kepsek/admin di server).
- Untuk menambah modul lain (PKL, Supervisi): panggil `Pengingat.buka({ modul, judul, tautan, penerima })`.
