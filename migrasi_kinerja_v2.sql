-- Tambah kategori ke-5 "Administrasi dan Kedisiplinan". Jalankan SETELAH migrasi_kinerja.sql. Aman diulang.
alter table public.kinerja_butir drop constraint if exists kinerja_butir_kategori_check;
alter table public.kinerja_butir add constraint kinerja_butir_kategori_check
  check (kategori in ('perangkat', 'pelaksanaan', 'penilaian', 'tugas_tambahan', 'administrasi'));
