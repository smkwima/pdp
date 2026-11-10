# Dashboard Ringkasan Kepala Sekolah (Beranda)

Tampil di **Beranda (`portal.html`)** hanya untuk akun Kepala Sekolah, di bagian *Pantauan Progres Guru*.

## Isi
- **4 kartu**: Nilai E-Rapor (% nilai rapor terisi), Kinerja Guru (% butir disetujui + jumlah yang menunggu dicek),
  Nilai PKL (rata-rata kelengkapan pendamping & penguji), Supervisi (jadwal selesai, terlambat, 30 hari ke depan).
  Mengetuk kartu membuka modulnya.
- **Perlu ditindaklanjuti**: daftar guru yang masih punya pekerjaan belum lengkap di E-Rapor / Kinerja / Nilai PKL,
  diurutkan dari yang paling banyak. Tombol **Ingatkan** (per guru) dan **Ingatkan semua** mengirim satu pengingat
  berisi rincian semua yang belum lengkap (modul "umum", tautan ke Beranda).

- **Riwayat Pengingat**: semua pengingat yang pernah dikirim (500 terbaru) dengan ringkasan terkirim / sudah dibaca / belum dibaca,
  filter modul dan status, pesan yang bisa dibuka, dan tombol **Ingatkan lagi** pada yang belum dibaca.
  Yang belum dibaca lebih dari 3 hari ditandai merah. Pengingat belum dibaca dengan modul + judul sama diperbarui (tidak ditumpuk).

## Tampilan HP
- Tabel "Perlu ditindaklanjuti" berubah menjadi kartu per guru (tanpa geser samping); bagian yang sudah lengkap disembunyikan.
- Tombol Ingatkan diperbesar agar mudah diketuk, filter riwayat selebar layar, dan kolom catatan di dialog tidak
  langsung memunculkan keyboard.

## Cara pasang
1. Unggah `dashboard-kepsek.js`, `portal.html`, dan `pengingat-kepsek.js` (versi terbaru).
2. Tidak ada migrasi database baru. Pastikan `migrasi_pengingat.sql` sudah dijalankan (untuk tombol Ingatkan).

## Catatan
- Hanya membaca data (Kepala Sekolah sudah punya hak baca). Tiap modul dimuat terpisah; kalau satu gagal, kartu lain tetap tampil.
- Guru dianggap "belum lengkap" di Kinerja bila belum punya butir, atau masih ada butir *draft*/*revisi*
  (butir yang menunggu cek Kepala Sekolah tidak dihitung sebagai kekurangan guru).
- Data Supervisi dibatasi 12 bulan terakhir; jadwal tidak terkait tahun ajaran.
