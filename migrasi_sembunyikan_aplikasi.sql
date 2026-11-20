-- =====================================================================
-- SEMBUNYIKAN APLIKASI DARI MENU (otomatis ikut terkunci)
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
-- Syarat: migrasi_developer.sql sudah dijalankan.
--
-- Kolom baru akses_aplikasi.tersembunyi:
--   true  = aplikasi hilang dari portal, menu bawah, dan menu "Aplikasi"
--           untuk semua pengguna selain developer. Halamannya tetap
--           terkunci (alamat langsung juga ditolak).
--   false = perilaku lama (kalau dikunci, kartu tampil dengan gembok).
-- Hanya berlaku bila aplikasi dikunci (aktif = false).
-- RLS tidak berubah: semua login boleh baca, hanya developer yang boleh ubah.
-- =====================================================================

alter table public.akses_aplikasi
  add column if not exists tersembunyi boolean not null default false;

-- Aplikasi yang sudah aktif tidak boleh berstatus tersembunyi.
update public.akses_aplikasi set tersembunyi = false where aktif = true and tersembunyi = true;
