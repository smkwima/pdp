-- =====================================================================
-- PENGINGAT DARI KEPALA SEKOLAH -> NOTIFIKASI GURU
-- HANYA Kepala Sekolah yang menekan tombol "Ingatkan" di dashboard
-- progres guru; pengingat muncul di lonceng notifikasi guru.
-- Admin TIDAK dapat mengirim (admin hanya melihat & menghapus lewat menu
-- "Pengingat ke Guru" di Pengaturan).
-- Aman dijalankan berulang.
--
-- Cara kerja:
--   * Kepsek MENGIRIM lewat fungsi  pengingat_kirim(...)
--     (kepsek hanya punya hak baca di tabel lain, jadi memakai fungsi
--      security definer yang memeriksa role).
--   * Guru MEMBACA pengingatnya sendiri (RLS) dan menandai dibaca lewat
--     fungsi pengingat_tandai_dibaca(...).
--   * Pengingat yang masih belum dibaca untuk guru + modul + judul yang sama
--     DIPERBARUI (bukan ditumpuk), jadi guru tidak kebanjiran notifikasi
--     bila tombol ditekan berkali-kali.
-- =====================================================================

-- 1) Pembantu peran: siapa yang boleh mengirim pengingat (HANYA kepala sekolah)
create or replace function public.pengingat_boleh_kirim()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'kepsek'
  );
$$;

-- Pembantu: admin boleh MELIHAT daftar pengingat (menu kelola), tapi tidak mengirim.
create or replace function public.pengingat_boleh_lihat_semua()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('kepsek', 'admin')
  );
$$;
grant execute on function public.pengingat_boleh_lihat_semua() to authenticated;

-- 2) Tabel pengingat
create table if not exists public.pengingat_guru (
  id            uuid primary key default gen_random_uuid(),
  guru_id       uuid not null references public.profiles(id) on delete cascade,
  pengirim_id   uuid references public.profiles(id) on delete set null,
  pengirim_nama text,
  modul         text not null default 'erapor'
                check (modul in ('erapor', 'kinerja', 'pkl', 'supervisi', 'bukuinduk', 'umum')),
  judul         text not null,
  pesan         text,
  tautan        text,                       -- halaman tujuan, mis. "guru.html"
  dibuat_pada   timestamptz not null default now(),
  dibaca_pada   timestamptz
);

create index if not exists pengingat_guru_guru_idx  on public.pengingat_guru (guru_id, dibaca_pada, dibuat_pada desc);
create index if not exists pengingat_guru_modul_idx on public.pengingat_guru (modul, dibuat_pada desc);

-- 3) RLS: guru melihat miliknya; kepsek/admin melihat semua (untuk "terakhir diingatkan" & kelola).
--    Tidak ada policy insert/update/delete: semua penulisan lewat fungsi di bawah.
alter table public.pengingat_guru enable row level security;

drop policy if exists pengingat_guru_select on public.pengingat_guru;
create policy pengingat_guru_select on public.pengingat_guru
  for select to authenticated
  using (guru_id = auth.uid() or public.pengingat_boleh_lihat_semua());

-- 4) Kirim pengingat (satu penerima per panggilan agar pesan bisa personal).
create or replace function public.pengingat_kirim(
  p_guru_id uuid,
  p_modul   text,
  p_judul   text,
  p_pesan   text default null,
  p_tautan  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nama   text;
  v_judul  text := left(btrim(coalesce(p_judul, '')), 120);
  v_pesan  text := nullif(left(btrim(coalesce(p_pesan, '')), 1500), '');
  v_tautan text := p_tautan;
  v_modul  text := coalesce(nullif(btrim(p_modul), ''), 'umum');
begin
  if not public.pengingat_boleh_kirim() then
    raise exception 'Hanya Kepala Sekolah yang dapat mengirim pengingat.' using errcode = '42501';
  end if;
  if v_judul = '' then
    raise exception 'Judul pengingat wajib diisi.' using errcode = '22023';
  end if;
  if v_modul not in ('erapor', 'kinerja', 'pkl', 'supervisi', 'bukuinduk', 'umum') then
    v_modul := 'umum';
  end if;
  -- Tautan hanya boleh halaman internal (nama-berkas.html atau dengan #bagian).
  if v_tautan is not null and v_tautan !~ '^[a-z0-9_\-]+\.html(#[a-z0-9_\-]*)?$' then
    v_tautan := null;
  end if;
  -- Hanya akun guru yang menerima.
  if not exists (select 1 from public.profiles where id = p_guru_id and role = 'guru') then
    return 0;
  end if;

  select nama into v_nama from public.profiles where id = auth.uid();

  -- Perbarui pengingat yang belum dibaca dengan modul & judul yang sama, kalau tidak ada baru buat.
  update public.pengingat_guru
     set pengirim_id = auth.uid(), pengirim_nama = v_nama, judul = v_judul,
         pesan = v_pesan, tautan = v_tautan, dibuat_pada = now()
   where guru_id = p_guru_id and modul = v_modul and judul = v_judul and dibaca_pada is null;

  if not found then
    insert into public.pengingat_guru (guru_id, pengirim_id, pengirim_nama, modul, judul, pesan, tautan)
    values (p_guru_id, auth.uid(), v_nama, v_modul, v_judul, v_pesan, v_tautan);
  end if;

  return 1;
end;
$$;

-- 5) Guru menandai pengingatnya sebagai sudah dibaca (null = semua).
create or replace function public.pengingat_tandai_dibaca(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.pengingat_guru
     set dibaca_pada = now()
   where guru_id = auth.uid()
     and dibaca_pada is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.pengingat_kirim(uuid, text, text, text, text) from public, anon;
revoke all on function public.pengingat_tandai_dibaca(uuid[]) from public, anon;
grant execute on function public.pengingat_kirim(uuid, text, text, text, text) to authenticated;
grant execute on function public.pengingat_tandai_dibaca(uuid[]) to authenticated;
grant execute on function public.pengingat_boleh_kirim() to authenticated;

-- 6) Realtime: notifikasi langsung muncul tanpa guru memuat ulang halaman.
do $$
begin
  alter publication supabase_realtime add table public.pengingat_guru;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- 7) HAPUS pengingat (khusus ADMIN). Dipakai menu "Pengingat" di panel admin.
--    p_ids null = hapus SEMUA pengingat; kalau diisi = hanya id tersebut.
--    Kepala sekolah tidak bisa menghapus (hanya admin).
create or replace function public.hapus_pengingat(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Hanya admin yang dapat menghapus pengingat.' using errcode = '42501';
  end if;
  delete from public.pengingat_guru where p_ids is null or id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.hapus_pengingat(uuid[]) from public, anon;
grant execute on function public.hapus_pengingat(uuid[]) to authenticated;

-- Agar penghapusan ikut terkirim lewat realtime (lonceng guru langsung bersih).
alter table public.pengingat_guru replica identity full;
