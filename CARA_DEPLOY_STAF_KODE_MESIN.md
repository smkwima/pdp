# Role Staf + Kode Mesin

Urutan (penting, jangan dibalik):

1. **SQL** — Supabase → SQL Editor → jalankan `migrasi_staf_kode_mesin.sql`.
   (Menambah role `staf`, kolom `profiles.kode_mesin` yang unik, dan fungsi `daftar_kode_mesin()`.)
2. **Edge Function** — deploy ulang `admin-create-guru`
   (`supabase functions deploy admin-create-guru`, atau paste isi `index.ts` di Dashboard → Edge Functions).
3. **Upload file web**: `penugasan-admin.html`, `portal.html`, `index.html`, `guru.html`,
   `pkl.html`, `pelanggaran.html`, `kinerja.html`, `supervisi.html`.

Pemakaian: menu **Guru & Penugasan → Guru**. Role bisa dipilih Guru / Staf / Admin,
dan kolom **Kode Mesin** diisi dengan No.ID fingerprint (angka; nol di depan otomatis dibuang,
sama seperti Rekap Absen). Import Excel punya kolom baru `Kode Mesin`.

Akun staf hanya masuk ke Menu Utama (belum ada menu). Staf tidak muncul di daftar penugasan mengajar.

---
# Sinkron kode mesin ke Rekap Absen (aman, lewat Secret)

Kunci rahasia hanya hidup di Secrets Edge Function pdp. Tidak ada kunci baru di HTML.

1. **Project Rekap Absen** -> SQL Editor -> jalankan `rekap_guard_kode_mesin.sql`
   (supaya kunci publik di halaman rekap tidak bisa menimpa data kode mesin).
2. **Project Rekap Absen** -> Project Settings -> API -> salin `service_role` key.
3. **Project pdp** -> Edge Functions -> Secrets, isi:
   - `REKAP_SUPABASE_URL` = `https://jvunlziapbmvxmrrnphd.supabase.co`
   - `REKAP_SERVICE_KEY`  = service_role key dari langkah 2
   (atau CLI: `supabase secrets set REKAP_SUPABASE_URL=... REKAP_SERVICE_KEY=...`)
4. Deploy function: `supabase functions deploy sync-kode-mesin`
5. Upload `penugasan-admin.html` (tombol baru) dan `rekap-absen-fingerprint.html` (versi baru).
6. Pakai: menu Guru -> klik **Sinkron ke Rekap Absen**. Buka rekap, status database akan menampilkan jumlah guru/staf dari pdp.

Perilaku rekap setelah sinkron: nama diambil dari pdp (menimpa nama di Excel/mesin); staf berkode mesin
dihitung walau tidak pernah scan (tampil Tidak hadir); guru tanpa jadwal tidak lagi dianggap staf.
