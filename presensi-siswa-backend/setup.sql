-- Jalankan di project PRESENSI SISWA (sfuucjmnlmfcghobpnkf) > SQL Editor. Aman dijalankan ulang.
-- Database presensi siswa TETAP terpisah dari e-Rapor/PDP. Berkas ini hanya memastikan tabelnya ada.
-- Bila tabel pres_* sudah ada (dari presensi-siswa-pdf.html lama), semua perintah di sini tidak mengubah apa pun
-- dan data presensi yang sudah tersimpan tetap aman. Kunci akses (RLS) ada di kunci.sql, dijalankan TERPISAH & TERAKHIR.

create table if not exists public.pres_tahun (
  id uuid primary key default gen_random_uuid(),
  rapor_id text unique,            -- id tahun_ajaran di e-Rapor
  nama text not null,
  semester text,
  aktif boolean not null default false
);

create table if not exists public.pres_kelas (
  id uuid primary key default gen_random_uuid(),
  rapor_id text unique,            -- id kelas di e-Rapor (kosong = kelas manual)
  nama text not null,
  tingkat text
);

create table if not exists public.pres_siswa (
  id uuid primary key default gen_random_uuid(),
  rapor_id text unique,            -- id siswa di e-Rapor (kosong = siswa manual)
  nis text,
  nisn text,
  nama text not null,
  status text
);

create table if not exists public.pres_rombel (
  id uuid primary key default gen_random_uuid(),
  tahun_id uuid not null references public.pres_tahun(id) on delete cascade,
  kelas_id uuid not null references public.pres_kelas(id) on delete cascade,
  siswa_id uuid not null references public.pres_siswa(id) on delete cascade,
  no_absen int,
  unique (tahun_id, siswa_id)
);

create table if not exists public.pres_sesi (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  tahun_id uuid references public.pres_tahun(id) on delete cascade,
  kelas_id uuid not null references public.pres_kelas(id) on delete cascade,
  unique (tanggal, kelas_id)
);

-- Hanya siswa yang TIDAK hadir yang punya baris (S = sakit, I = ijin, A = tanpa keterangan).
create table if not exists public.pres_absen (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  siswa_id uuid not null references public.pres_siswa(id) on delete cascade,
  status text not null check (status in ('S','I','A')),
  unique (tanggal, siswa_id)
);
create index if not exists pres_absen_siswa_tanggal_idx on public.pres_absen (siswa_id, tanggal);
