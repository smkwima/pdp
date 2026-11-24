-- TUGAS LUAR: guru mengisi sendiri keperluan + rentang waktu (tanpa persetujuan admin), lalu absen foto + titik lokasi satu kali.
-- Jalankan di project PRESENSI (nrwexyezcbmsokelgkmp) > SQL Editor. Aman dijalankan ulang.
-- Sesudahnya deploy ulang Edge Function presensi-api (presensi-backend/presensi-api.ts) dan unggah presensi.html.

-- 1) Jenis presensi baru 'tugas_luar' (selain 'datang' dan 'pulang') + akurasi GPS saat absen.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.presensi_log'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%jenis%' loop
    execute format('alter table public.presensi_log drop constraint %I', c);
  end loop;
  alter table public.presensi_log
    add constraint presensi_log_jenis_check check (jenis in ('datang','pulang','tugas_luar'));
end $$;
alter table public.presensi_log add column if not exists akurasi_m int;

-- 2) Daftar Tugas Luar yang diisi guru. Satu tugas per pegawai per tanggal.
--    role disimpan agar jadwal pulang pegawai itu bisa dihitung ulang di rekap.
create table if not exists public.presensi_tugas (
  id uuid primary key default gen_random_uuid(),
  pegawai_id uuid not null,
  role text,
  tanggal date not null,
  jam_mulai time not null,
  jam_selesai time not null,
  keperluan text not null,
  created_at timestamptz not null default now(),
  check (jam_selesai > jam_mulai),
  unique (pegawai_id, tanggal)
);
create index if not exists presensi_tugas_tanggal_idx on public.presensi_tugas (tanggal);
-- RLS aktif tanpa policy: hanya Edge Function presensi-api (service role) yang bisa membaca/menulis.
alter table public.presensi_tugas enable row level security;
