-- =====================================================================
-- Rekap Nilai PKL di dashboard guru pembimbing
-- Masalah: pembimbing melihat "Penguji: belum ditunjuk" dan nilai Penguji "—"
-- walau penguji sudah ditunjuk dan nilai sudah diisi. Penyebab yang paling
-- mungkin: aturan keamanan (RLS) hanya mengizinkan guru membaca baris
-- yang dibuatnya sendiri, sehingga baris milik guru penguji tidak terbaca.
--
-- LANGKAH 1 (periksa dulu) — jalankan di Supabase > SQL Editor:
--   select tablename, policyname, cmd, qual
--   from pg_policies
--   where tablename in ('nilai_pkl','pkl_penguji','pkl_pembimbing');
-- Kalau sudah ada policy SELECT yang mengizinkan pembimbing membaca baris
-- siswa binaannya, berkas ini tidak perlu dijalankan.
--
-- LANGKAH 2 — jalankan bagian di bawah (aman diulang):
-- Pembimbing boleh MEMBACA (bukan mengubah) nilai dan penguji untuk siswa
-- yang menjadi binaannya pada tahun ajaran yang sama.
-- =====================================================================

drop policy if exists "pembimbing baca nilai_pkl binaan" on public.nilai_pkl;
create policy "pembimbing baca nilai_pkl binaan"
on public.nilai_pkl for select to authenticated
using (
  exists (
    select 1 from public.pkl_pembimbing p
    where p.siswa_id = nilai_pkl.siswa_id
      and p.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
      and p.guru_id = auth.uid()
  )
);

drop policy if exists "pembimbing baca pkl_penguji binaan" on public.pkl_penguji;
create policy "pembimbing baca pkl_penguji binaan"
on public.pkl_penguji for select to authenticated
using (
  exists (
    select 1 from public.pkl_pembimbing p
    where p.siswa_id = pkl_penguji.siswa_id
      and p.tahun_ajaran_id = pkl_penguji.tahun_ajaran_id
      and p.guru_id = auth.uid()
  )
);

-- =====================================================================
-- NAMA PENGUJI di Rekap Nilai pembimbing
-- Bila nilai Penguji sudah tampil tetapi nama penguji masih "belum ditunjuk",
-- biasanya profil guru lain tidak boleh dibaca akun pembimbing (RLS tabel
-- profiles). Daripada membuka seluruh tabel profiles (berisi email, NIP, dst),
-- fungsi di bawah hanya mengembalikan NAMA penguji untuk siswa binaan
-- pembimbing yang sedang masuk. Aman dijalankan ulang.
-- =====================================================================
create or replace function public.pkl_penguji_binaan()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'siswa_id', pg.siswa_id,
           'tahun_ajaran_id', pg.tahun_ajaran_id,
           'nama', pr.nama)), '[]'::json)
  from public.pkl_penguji pg
  join public.pkl_pembimbing pb
    on pb.siswa_id = pg.siswa_id
   and pb.tahun_ajaran_id = pg.tahun_ajaran_id
   and pb.guru_id = auth.uid()
  join public.profiles pr on pr.id = pg.guru_id;
$$;

revoke all on function public.pkl_penguji_binaan() from public;
grant execute on function public.pkl_penguji_binaan() to authenticated;
