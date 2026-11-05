-- =====================================================================
-- JADWAL KEGIATAN (HITUNG MUNDUR) — diatur admin di Pengaturan Sekolah,
-- tampil di dashboard tiap modul (E-Rapor, PKL, Buku Induk, dst).
-- Aman dijalankan berulang.
-- =====================================================================

create table if not exists public.jadwal_kegiatan (
  id            uuid primary key default gen_random_uuid(),
  modul         text not null default 'erapor',   -- erapor | pkl | bukuinduk | penugasan | supervisi | pelanggaran | umum
  judul         text not null,
  keterangan    text,
  waktu_mulai   timestamptz not null,             -- titik hitung mundur
  waktu_selesai timestamptz,                      -- opsional; kosong = berakhir di akhir hari waktu_mulai
  untuk_admin   boolean not null default true,
  untuk_guru    boolean not null default true,
  untuk_siswa   boolean not null default true,
  aktif         boolean not null default true,
  dibuat_pada   timestamptz not null default now(),
  diubah_pada   timestamptz not null default now()
);

create index if not exists jadwal_kegiatan_modul_idx on public.jadwal_kegiatan (modul, waktu_mulai);

-- Pembantu: apakah pengguna saat ini admin?
create or replace function public.jk_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Rapikan kolom diubah_pada otomatis
create or replace function public.jk_set_diubah()
returns trigger
language plpgsql
as $$
begin
  new.diubah_pada := now();
  return new;
end;
$$;

drop trigger if exists jk_set_diubah on public.jadwal_kegiatan;
create trigger jk_set_diubah
  before update on public.jadwal_kegiatan
  for each row execute function public.jk_set_diubah();

alter table public.jadwal_kegiatan enable row level security;

-- Semua pengguna yang sudah login (admin, guru, kepsek, siswa) boleh MELIHAT.
drop policy if exists jk_baca on public.jadwal_kegiatan;
create policy jk_baca on public.jadwal_kegiatan
  for select to authenticated using (true);

-- Hanya admin yang boleh menambah / mengubah / menghapus.
drop policy if exists jk_admin_tulis on public.jadwal_kegiatan;
create policy jk_admin_tulis on public.jadwal_kegiatan
  for all to authenticated
  using (public.jk_is_admin())
  with check (public.jk_is_admin());

grant select on public.jadwal_kegiatan to authenticated;
grant insert, update, delete on public.jadwal_kegiatan to authenticated;
