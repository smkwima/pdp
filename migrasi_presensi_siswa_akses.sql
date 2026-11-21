-- =====================================================================
-- DAFTARKAN "PRESENSI SISWA" DI DEVELOPER (kunci / sembunyikan dari menu)
-- Jalankan di Supabase PDP (e-Rapor) -> SQL Editor. Aman dijalankan ulang.
-- Syarat: migrasi_developer.sql sudah dijalankan.
-- Setelah ini, Presensi Siswa muncul di developer.html -> Akses Aplikasi.
-- Kode harus sama dengan akses-guard.js ('presiswa').
-- =====================================================================
insert into public.akses_aplikasi (kode, nama) values ('presiswa', 'Presensi Siswa')
on conflict (kode) do nothing;
