-- =====================================================================
-- ROLE "PENGAWAS" (Pengawas Sekolah) — akun LIHAT-SAJA
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
--
-- 1. Role baru 'pengawas' di profiles.role (ENUM maupun CHECK).
-- 2. Fungsi is_pengawas().
-- 3. Hak BACA (SELECT) pengawas hanya pada tabel yang dibutuhkan:
--    E-Rapor (rekap), Guru & Penugasan, Nilai PKL, Supervisi, Kinerja Guru.
--    TIDAK diberi: Buku Induk (bi_*, NIK/KK), Pelanggaran/CP, Pengaduan,
--    Ijin, Log Aktivitas, Pengingat. Pengawas tidak bisa menulis apa pun
--    di tabel sekolah.
-- 4. Tabel catatan_pengawas (temuan/rekomendasi/tindak lanjut). Satu-satunya
--    data yang boleh DITULIS pengawas; hanya miliknya sendiri.
--    Kepala Sekolah & Admin boleh MEMBACA semua catatan.
--
-- Cara membuat akun pengawas: buat user di Authentication, lalu di tabel
-- profiles isi role = 'pengawas' (lihat CARA_DEPLOY_PENGAWAS.md).
-- =====================================================================

-- 1. Izinkan role 'pengawas' (menangani kolom bertipe ENUM maupun CHECK)
do $$
declare
  v_enum text;
  c record;
  v_role_list text;
begin
  select t.typname into v_enum
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass
    and a.attname = 'role' and t.typtype = 'e';

  if v_enum is not null then
    execute format('alter type public.%I add value if not exists %L', v_enum, 'pengawas');
  else
    for c in
      select conname from pg_constraint
      where conrelid = 'public.profiles'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%role%'
        and pg_get_constraintdef(oid) ilike '%guru%'
    loop
      execute format('alter table public.profiles drop constraint %I', c.conname);
    end loop;
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'guru', 'kepsek', 'staf', 'pengawas')) not valid;
  end if;
end $$;

-- 2. Pembantu peran (role dibandingkan sebagai teks supaya aman untuk ENUM)
create or replace function public.is_pengawas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'pengawas'
  );
$$;
grant execute on function public.is_pengawas() to authenticated;

create or replace function public.catatan_pengawas_boleh_baca_semua()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('kepsek', 'admin')
  );
$$;
grant execute on function public.catatan_pengawas_boleh_baca_semua() to authenticated;

-- 3. Hak BACA pengawas — hanya tabel di daftar ini.
--    Tabel yang belum ada dilewati. Policy ini tidak mengaktifkan RLS di tabel
--    mana pun (kalau RLS tabel itu belum aktif, tidak ada yang berubah).
do $$
declare
  t text;
  tabel text[] := array[
    -- umum / referensi
    'profiles', 'tahun_ajaran', 'profil_sekolah', 'jadwal_kegiatan',
    -- E-Rapor (rekap kelengkapan; TANPA bi_siswa_detail)
    'kelas', 'siswa', 'siswa_kelas', 'mata_pelajaran', 'mapel_kelas',
    'mapel_semester', 'mapel_urutan_kelas', 'nilai', 'tujuan_pembelajaran',
    'rekap_presensi', 'rapor_terbit',
    -- Guru & Penugasan
    'wali_kelas', 'penugasan_guru', 'pj_kokurikuler', 'pembina_ekstrakurikuler',
    'kegiatan_kokurikuler', 'ekstrakurikuler', 'ekstrakurikuler_siswa',
    -- Nilai PKL
    'pkl_pembimbing', 'pkl_penguji', 'nilai_pkl',
    -- Supervisi
    'supervisi_jadwal', 'supervisi_form', 'supervisi_penugasan',
    'supervisi_mapel', 'supervisi_guru', 'supervisi_ttd',
    -- Kinerja Guru
    'kinerja_butir'
  ];
begin
  foreach t in array tabel loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabel % tidak ada, dilewati', t;
      continue;
    end if;
    execute format('drop policy if exists pengawas_lihat on public.%I', t);
    execute format(
      'create policy pengawas_lihat on public.%I for select to authenticated using (public.is_pengawas())', t);
  end loop;
end $$;

-- 4. Catatan Pengawas
create table if not exists public.catatan_pengawas (
  id            uuid primary key default gen_random_uuid(),
  pengawas_id   uuid not null references public.profiles(id) on delete cascade,
  pengawas_nama text,
  tanggal       date not null default current_date,
  jenis         text not null default 'kunjungan'
                check (jenis in ('kunjungan', 'temuan', 'rekomendasi', 'tindak_lanjut')),
  judul         text not null check (length(btrim(judul)) > 0),
  isi           text,
  dibuat_pada   timestamptz not null default now(),
  diubah_pada   timestamptz not null default now()
);

create index if not exists catatan_pengawas_tgl_idx
  on public.catatan_pengawas (tanggal desc, dibuat_pada desc);
create index if not exists catatan_pengawas_oleh_idx
  on public.catatan_pengawas (pengawas_id);

alter table public.catatan_pengawas enable row level security;

drop policy if exists catatan_pengawas_baca on public.catatan_pengawas;
create policy catatan_pengawas_baca on public.catatan_pengawas
  for select to authenticated
  using (
    (public.is_pengawas() and pengawas_id = auth.uid())
    or public.catatan_pengawas_boleh_baca_semua()
  );

drop policy if exists catatan_pengawas_tambah on public.catatan_pengawas;
create policy catatan_pengawas_tambah on public.catatan_pengawas
  for insert to authenticated
  with check (public.is_pengawas() and pengawas_id = auth.uid());

drop policy if exists catatan_pengawas_ubah on public.catatan_pengawas;
create policy catatan_pengawas_ubah on public.catatan_pengawas
  for update to authenticated
  using (public.is_pengawas() and pengawas_id = auth.uid())
  with check (public.is_pengawas() and pengawas_id = auth.uid());

drop policy if exists catatan_pengawas_hapus on public.catatan_pengawas;
create policy catatan_pengawas_hapus on public.catatan_pengawas
  for delete to authenticated
  using (public.is_pengawas() and pengawas_id = auth.uid());

-- diubah_pada otomatis
create or replace function public.catatan_pengawas_touch()
returns trigger
language plpgsql
as $$
begin
  new.diubah_pada := now();
  return new;
end;
$$;

drop trigger if exists catatan_pengawas_touch on public.catatan_pengawas;
create trigger catatan_pengawas_touch
  before update on public.catatan_pengawas
  for each row execute function public.catatan_pengawas_touch();

grant select, insert, update, delete on public.catatan_pengawas to authenticated;

-- 5. Pemeriksaan (opsional): harus kosong = pengawas TIDAK punya akses ke tabel sensitif
-- select tablename, policyname from pg_policies
-- where policyname = 'pengawas_lihat'
--   and tablename in ('bi_siswa_detail', 'bi_riwayat_semester');
