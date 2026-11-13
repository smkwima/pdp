-- =====================================================================
-- KINERJA SAYA untuk role STAF. Jalankan SETELAH migrasi_kinerja.sql dan
-- migrasi_kinerja_v2.sql. Aman diulang.
--
-- Guru memilih aspek dari daftar (kategori perangkat, pelaksanaan, dst).
-- Staf menulis aspek dan contoh bukti dukung SECARA MANUAL:
--   kategori = 'manual', judul = teks aspek yang diketik staf,
--   contoh   = contoh bukti dukung yang diketik staf (boleh kosong).
-- Aturan RLS lama sudah cukup (staf hanya melihat & mengubah miliknya;
-- Kepala Sekolah / admin melihat semuanya dan memberi jempol).
-- =====================================================================
alter table public.kinerja_butir add column if not exists contoh text;

alter table public.kinerja_butir drop constraint if exists kinerja_butir_kategori_check;
alter table public.kinerja_butir add constraint kinerja_butir_kategori_check
  check (kategori in ('perangkat', 'pelaksanaan', 'penilaian', 'tugas_tambahan', 'administrasi', 'manual'));
