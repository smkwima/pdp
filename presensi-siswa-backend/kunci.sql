-- Jalankan di project PRESENSI SISWA (sfuucjmnlmfcghobpnkf) > SQL Editor. Aman dijalankan ulang.
--
-- URUTAN: jalankan berkas ini SETELAH (1) Edge Function presensi-siswa-api ter-deploy + secret terisi,
-- dan (2) presensi-siswa.html sudah diunggah ke PDP.
--
-- Efek: tabel presensi siswa tertutup untuk kunci anon/publishable. Hanya Edge Function (service role) yang bisa
-- membaca/menulis, sehingga hak akses (wali kelas hanya kelasnya, kepala sekolah baca-saja) dijaga di server.
-- PERHATIAN: halaman lama presensi-siswa-pdf.html (yang memakai kunci anon langsung) berhenti berfungsi setelah ini.

do $$
declare t text; p record;
begin
  foreach t in array array['pres_tahun','pres_kelas','pres_siswa','pres_rombel','pres_sesi','pres_absen'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- Pemeriksaan: semua baris harus rls_aktif = true dan jumlah_policy = 0.
select c.relname as tabel, c.relrowsecurity as rls_aktif,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as jumlah_policy
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'pres\_%' and c.relkind = 'r'
order by c.relname;
