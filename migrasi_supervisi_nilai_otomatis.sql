-- Pilihan fitur "Nilai Otomatis" (Isi Otomatis) per form/instrumen supervisi.
-- true (default) = supervisor boleh memakai Isi Otomatis; false = form diisi manual saja.
-- Jalankan sekali di Supabase SQL Editor. Aman diulang.
alter table public.supervisi_form
  add column if not exists nilai_otomatis boolean not null default true;
