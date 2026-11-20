-- Jalankan di project PRESENSI (nrwexyezcbmsokelgkmp) > SQL Editor. Aman dijalankan ulang.
-- Semua data presensi disimpan di project ini. e-Rapor/PDP hanya dibaca (login + data pegawai).
-- RLS aktif TANPA policy: kunci anon/publishable tidak bisa menyentuh tabel ini sama sekali;
-- hanya Edge Function presensi-api (service role) yang membaca/menulis.

create table if not exists public.presensi_lokasi (
  id int primary key default 1 check (id = 1),
  nama_lokasi text default 'Sekolah',
  lat double precision default 0,
  lng double precision default 0,
  radius_m int default 100,
  toleransi_menit int default 0
);
insert into public.presensi_lokasi (id) values (1) on conflict do nothing;

-- pegawai_id = id akun di e-Rapor (profiles.id). Tanpa foreign key karena beda project.
-- jenis: 'reguler' = jadwal acuan 1, 'tes' = jadwal acuan 2 (pengawas tes). jp/kelas = info dari berkas jadwal.
create table if not exists public.presensi_jadwal (
  id uuid primary key default gen_random_uuid(),
  pegawai_id uuid not null,
  hari int not null check (hari between 1 and 7),   -- 1=Senin ... 7=Minggu
  jam_masuk time not null,
  jam_pulang time not null
);
-- Untuk tabel versi lama (tanpa kolom jenis): tambah kolom & ganti kunci unik. Aman dijalankan ulang.
alter table public.presensi_jadwal add column if not exists jenis text not null default 'reguler';
alter table public.presensi_jadwal add column if not exists jp int not null default 0;
alter table public.presensi_jadwal add column if not exists kelas text;
alter table public.presensi_jadwal drop constraint if exists presensi_jadwal_pegawai_id_hari_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'presensi_jadwal_jenis_ck') then
    alter table public.presensi_jadwal add constraint presensi_jadwal_jenis_ck check (jenis in ('reguler','tes'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'presensi_jadwal_uq') then
    alter table public.presensi_jadwal add constraint presensi_jadwal_uq unique (pegawai_id, jenis, hari);
  end if;
end $$;

-- Pengaturan (key -> json): pengaturan (jam staf + tanggal acuan tes/pasca tes/piket), libur, fm (force majeure),
-- staf (guru tugas tambahan staf), piket (peserta per hari), file_reguler, file_tes (nama berkas terakhir).
create table if not exists public.presensi_cfg (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.presensi_log (
  id uuid primary key default gen_random_uuid(),
  pegawai_id uuid not null,
  tanggal date not null default (now() at time zone 'Asia/Jakarta')::date,
  jenis text not null check (jenis in ('datang','pulang')),
  waktu timestamptz not null default now(),
  lat double precision, lng double precision, jarak_m int,
  foto_path text, status text,
  unique (pegawai_id, tanggal, jenis)
);
create index if not exists presensi_log_tanggal_idx on public.presensi_log (tanggal);

alter table public.presensi_lokasi enable row level security;
alter table public.presensi_jadwal enable row level security;
alter table public.presensi_log enable row level security;
alter table public.presensi_cfg enable row level security;

-- Ganti SELURUH jadwal satu jenis (reguler/tes) dengan isi berkas (atomik). p_rows kosong = hapus semua jadwal jenis itu.
-- Hanya service role (Edge Function) yang boleh memanggil.
drop function if exists public.presensi_ganti_jadwal(jsonb);
create or replace function public.presensi_ganti_jadwal(p_jenis text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if p_jenis not in ('reguler','tes') then raise exception 'jenis tidak valid'; end if;
  delete from public.presensi_jadwal where jenis = p_jenis;
  if jsonb_array_length(p_rows) > 0 then
    insert into public.presensi_jadwal (pegawai_id, jenis, hari, jam_masuk, jam_pulang, jp, kelas)
      select (r->>'pegawai_id')::uuid, p_jenis, (r->>'hari')::int, (r->>'jam_masuk')::time, (r->>'jam_pulang')::time,
             coalesce((r->>'jp')::int, 0), r->>'kelas'
      from jsonb_array_elements(p_rows) r
    on conflict (pegawai_id, jenis, hari) do update
      set jam_masuk = excluded.jam_masuk, jam_pulang = excluded.jam_pulang, jp = excluded.jp, kelas = excluded.kelas;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke all on function public.presensi_ganti_jadwal(text, jsonb) from public, anon, authenticated;
grant execute on function public.presensi_ganti_jadwal(text, jsonb) to service_role;

-- Bucket foto selfie: privat, tanpa policy (hanya Edge Function yang bisa baca/tulis).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfie', 'selfie', false, 20480, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 20480, allowed_mime_types = array['image/jpeg'];
