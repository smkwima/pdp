# Pengumuman Kepala Sekolah + perbaikan pengumuman Developer + pengingat guru

## Cara pasang
1. **Supabase → SQL Editor** → jalankan `migrasi_pengumuman.sql` (aman diulang).
   (`migrasi_sistem.sql` dan `migrasi_pengingat.sql` tidak perlu diulang kalau sudah pernah dijalankan.)
2. Unggah berkas yang berubah: `akses-guard.js`, `pengingat-guru.js`, `pengumuman-kepsek.js` (baru),
   `developer.html`, `portal.html`, dan semua halaman HTML lain (hanya nomor versi skrip yang naik:
   `akses-guard.js?v=3`, `pengingat-guru.js?v=3`) supaya cache browser diperbarui.

## Yang berubah
- **Pengingat Kepala Sekolah → guru:** begitu ditandai dibaca (ketuk pengingat atau "Tandai semua dibaca"),
  pengingat hilang dari lonceng guru. Lonceng hanya menampilkan yang belum dibaca. Menu Admin →
  *Pengingat ke Guru* tetap menampilkan semua riwayat (termasuk status sudah dibaca).
- **Pengumuman Kepala Sekolah:** di Menu Utama akun Kepala Sekolah ada bagian *Pengumuman Sekolah*:
  buat, ubah, nonaktifkan, hapus. Pilihan jenis (Informasi / Peringatan / Penting), judul opsional,
  waktu berakhir opsional. Tampil sebagai banner untuk semua pengguna. Hanya role `kepsek` yang bisa menulis
  (dicek di server lewat fungsi `pengumuman_simpan` / `pengumuman_hapus`).
- **Pengumuman Developer:** banner kini diambil langsung dari database tiap halaman dibuka, lalu diperbarui
  tiap 2 menit dan saat tab kembali aktif (tanpa muat ulang). Banner Developer dan Kepala Sekolah bisa tampil
  bersamaan. Halaman yang dibuka tanpa akhiran `.html` (mis. `/portal`) juga ikut dijaga.
- **Developer → Simpan pengumuman:** sekarang melaporkan GAGAL bila tidak ada baris yang berubah
  (sebelumnya tetap tertulis "Tersimpan" walau ditolak RLS), dan ada pengingat bahwa perubahan baru berlaku
  setelah klik **Simpan pengumuman**.

## Kalau pengumuman Developer masih belum muncul
1. Developer → Pemeliharaan & Pengumuman: nyalakan saklar, isi teks, klik **Simpan pengumuman**, pastikan
   muncul "Tersimpan" (bukan "Gagal: ...").
2. Pastikan `migrasi_sistem.sql` sudah dijalankan dan baris `pengaturan_sistem` dengan `id = 1` ada.
3. Muat ulang paksa (Ctrl+F5) di perangkat guru; di aplikasi Android/PWA tutup dan buka ulang.
4. Banner yang pernah ditutup pengguna tidak muncul lagi di sesi yang sama; mengubah/menyimpan ulang
   pengumuman memunculkannya kembali.
