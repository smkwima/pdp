-- Cara pengisian per form/instrumen supervisi (menggantikan kolom boolean nilai_otomatis):
--   'penuh'  = Isi Otomatis angka + komentar/catatan (bawaan)
--   'angka'  = Isi Otomatis hanya angka/pilihan, tanpa komentar
--   'manual' = tanpa fitur Isi Otomatis
-- Jalankan sekali di Supabase SQL Editor. Aman diulang. Tidak perlu menjalankan migrasi_supervisi_nilai_otomatis.sql lebih dulu.
alter table public.supervisi_form
  add column if not exists mode_otomatis text not null default 'penuh'
  check (mode_otomatis in ('penuh', 'angka', 'manual'));

-- Bila migrasi lama (kolom nilai_otomatis) sudah pernah dijalankan: form yang diset "tidak ada" menjadi 'manual'
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'supervisi_form' and column_name = 'nilai_otomatis') then
    update public.supervisi_form set mode_otomatis = 'manual'
    where nilai_otomatis = false and mode_otomatis = 'penuh';
  end if;
end $$;
