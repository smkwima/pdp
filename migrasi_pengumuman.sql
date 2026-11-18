-- =====================================================================
-- PENGUMUMAN DARI KEPALA SEKOLAH -> BANNER DI PORTAL & HALAMAN APLIKASI
-- Jalankan di Supabase -> SQL Editor. Aman dijalankan ulang.
--
-- * HANYA Kepala Sekolah (profiles.role = 'kepsek') yang dapat membuat,
--   mengubah, menonaktifkan, dan menghapus pengumuman (lewat fungsi
--   pengumuman_simpan / pengumuman_hapus yang memeriksa role di server).
-- * Semua pengguna yang login boleh MEMBACA (dipakai akses-guard.js untuk
--   menampilkan banner). Tidak ada policy insert/update/delete langsung.
-- * Pengumuman Developer (tabel pengaturan_sistem) tetap berjalan sendiri;
--   banner keduanya tampil bersamaan.
-- =====================================================================

-- 1) Pembantu peran
create or replace function public.pengumuman_boleh_kelola()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'kepsek'
  );
$$;
grant execute on function public.pengumuman_boleh_kelola() to authenticated;

-- 2) Tabel
create table if not exists public.pengumuman_sekolah (
  id            uuid primary key default gen_random_uuid(),
  pengirim_id   uuid references public.profiles(id) on delete set null,
  pengirim_nama text,
  jenis         text not null default 'info' check (jenis in ('info', 'peringatan', 'penting')),
  judul         text,
  teks          text not null,
  aktif         boolean not null default true,
  berakhir_pada timestamptz,
  dibuat_pada   timestamptz not null default now(),
  diubah_pada   timestamptz not null default now()
);

create index if not exists pengumuman_sekolah_aktif_idx
  on public.pengumuman_sekolah (aktif, dibuat_pada desc);

-- Penerima tertentu: null = semua pengguna; isi = hanya akun (guru/staf) dengan id tersebut.
alter table public.pengumuman_sekolah add column if not exists penerima uuid[];

-- 3) RLS: pengumuman untuk semua dibaca semua pengguna login; pengumuman bertarget hanya
--    dibaca penerimanya dan Kepala Sekolah. Penulisan hanya lewat fungsi.
alter table public.pengumuman_sekolah enable row level security;

drop policy if exists pengumuman_sekolah_baca on public.pengumuman_sekolah;
create policy pengumuman_sekolah_baca on public.pengumuman_sekolah
  for select to authenticated
  using (penerima is null or auth.uid() = any (penerima) or public.pengumuman_boleh_kelola());

-- 4) Simpan (buat baru bila p_id null, ubah bila p_id diisi).
--    p_penerima null = semua pengguna; berisi id = hanya guru/staf tersebut.
drop function if exists public.pengumuman_simpan(uuid, text, text, text, timestamptz, boolean);

create or replace function public.pengumuman_simpan(
  p_id       uuid,
  p_jenis    text,
  p_judul    text,
  p_teks     text,
  p_berakhir timestamptz,
  p_aktif    boolean,
  p_penerima uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nama      text;
  v_id        uuid;
  v_teks      text := left(btrim(coalesce(p_teks, '')), 600);
  v_judul     text := nullif(left(btrim(coalesce(p_judul, '')), 80), '');
  v_jenis     text := coalesce(nullif(btrim(p_jenis), ''), 'info');
  v_penerima  uuid[] := null;
begin
  if not public.pengumuman_boleh_kelola() then
    raise exception 'Hanya Kepala Sekolah yang dapat membuat pengumuman.' using errcode = '42501';
  end if;
  if v_teks = '' then
    raise exception 'Isi pengumuman wajib diisi.' using errcode = '22023';
  end if;
  if v_jenis not in ('info', 'peringatan', 'penting') then
    v_jenis := 'info';
  end if;

  -- Penerima tertentu: hanya akun guru/staf yang valid; wajib minimal satu.
  if p_penerima is not null then
    select array_agg(pr.id) into v_penerima
      from public.profiles pr
     where pr.id = any (p_penerima) and pr.role::text in ('guru', 'staf');
    if v_penerima is null then
      raise exception 'Pilih minimal satu guru atau staf penerima.' using errcode = '22023';
    end if;
  end if;

  select nama into v_nama from public.profiles where id = auth.uid();

  if p_id is null then
    insert into public.pengumuman_sekolah (pengirim_id, pengirim_nama, jenis, judul, teks, aktif, berakhir_pada, penerima)
    values (auth.uid(), v_nama, v_jenis, v_judul, v_teks, coalesce(p_aktif, true), p_berakhir, v_penerima)
    returning id into v_id;
  else
    update public.pengumuman_sekolah
       set jenis = v_jenis, judul = v_judul, teks = v_teks,
           aktif = coalesce(p_aktif, true), berakhir_pada = p_berakhir,
           penerima = v_penerima,
           pengirim_id = auth.uid(), pengirim_nama = v_nama,
           diubah_pada = now()          -- diubah: banner yang pernah ditutup muncul lagi
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Pengumuman tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- 5) Hapus
create or replace function public.pengumuman_hapus(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.pengumuman_boleh_kelola() then
    raise exception 'Hanya Kepala Sekolah yang dapat menghapus pengumuman.' using errcode = '42501';
  end if;
  delete from public.pengumuman_sekolah where id = p_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.pengumuman_simpan(uuid, text, text, text, timestamptz, boolean, uuid[]) from public, anon;
revoke all on function public.pengumuman_hapus(uuid) from public, anon;
grant execute on function public.pengumuman_simpan(uuid, text, text, text, timestamptz, boolean, uuid[]) to authenticated;
grant execute on function public.pengumuman_hapus(uuid) to authenticated;
