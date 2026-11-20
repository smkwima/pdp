-- =====================================================================
-- DAFTARKAN "PRESENSI" DI DEVELOPER (kunci / sembunyikan dari menu)
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
-- Syarat: migrasi_developer.sql sudah dijalankan.
-- Setelah ini, Presensi muncul di developer.html -> Akses Aplikasi.
-- =====================================================================
insert into public.akses_aplikasi (kode, nama) values ('presensi', 'Presensi')
on conflict (kode) do nothing;
