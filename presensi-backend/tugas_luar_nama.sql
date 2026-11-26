-- TUGAS LUAR tampil di dashboard "Guru Tidak Hadir Hari Ini".
-- Jalankan di project PRESENSI (nrwexyezcbmsokelgkmp) > SQL Editor. Aman dijalankan ulang.
-- Sesudahnya deploy ulang Edge Function presensi-api (presensi-backend/presensi-api.ts) dan unggah portal.html.
--
-- Kolom nama diisi otomatis oleh presensi-api saat guru menyimpan Tugas Luar (aksi tugas_simpan),
-- agar nama bisa ditampilkan tanpa membuka tabel profiles e-Rapor milik orang lain.
-- Tugas Luar yang sudah dibuat sebelum skrip ini tidak punya nama, jadi tidak ikut tampil di dashboard
-- (hanya berpengaruh pada tugas hari itu; tugas berikutnya otomatis lengkap).
alter table public.presensi_tugas add column if not exists nama text;
