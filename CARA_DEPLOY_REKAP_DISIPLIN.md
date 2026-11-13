# Rekap Kedisiplinan untuk Kepala Sekolah

Kepala Sekolah melihat DAFTAR NAMA guru & staf + PREDIKAT kedisiplinan saja (tanpa jam scan, jumlah menit, atau rincian lain).
Sumbernya rekap yang disimpan admin di Rekap Absen (tombol "Simpan rekap").

1. Project pdp -> deploy Edge Function baru: `supabase functions deploy rekap-disiplin`
   (atau Dashboard -> Edge Functions -> buat `rekap-disiplin`, isi dengan `supabase/functions/rekap-disiplin/index.ts`).
   Secrets `REKAP_SUPABASE_URL` dan `REKAP_SERVICE_KEY` sudah ada, tidak perlu diisi lagi.
2. Upload `disiplin.html`, `portal.html`, `bottomnav.js` dan semua halaman yang memuat `bottomnav.js?v=9`.
3. Tidak perlu SQL. Rekap yang tampil = rekap tersimpan; pilih rekap lain lewat dropdown di halaman.

Akses: Kepala Sekolah (dan admin). Guru/staf yang membuka disiplin.html dikembalikan ke Menu Utama,
dan server menolak permintaannya.
