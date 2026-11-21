# Presensi Siswa di PDP (database tetap terpisah)

Presensi Siswa sekarang menjadi halaman PDP (`presensi-siswa.html`), memakai **login PDP yang sama** (tanpa login/sandi
sendiri), persis seperti Presensi guru. Data presensi siswa **tetap di database Supabase sendiri**
(`sfuucjmnlmfcghobpnkf`); e-Rapor/PDP hanya dibaca untuk login, peran, dan data wali kelas.

Cara kerja: halaman mengirim token login PDP ke Edge Function `presensi-siswa-api` (header `x-rapor-token`). Fungsi
memverifikasi token ke e-Rapor, menentukan kelas yang boleh diakses, lalu membaca/menulis database presensi siswa dengan
service role. Browser tidak lagi memegang kunci database presensi siswa.

## Hak akses
| Peran | Yang bisa dilakukan |
|---|---|
| Admin | Semua kelas: isi/ubah presensi, rekap, cetak PDF, kelola kelas & siswa manual, sinkron dari e-Rapor |
| Guru (wali kelas) | Hanya kelas yang ia wali (tabel `wali_kelas` e-Rapor, per tahun ajaran): isi/ubah presensi, rekap, cetak PDF |
| Kepala sekolah | Semua kelas, **baca saja** (rekap + cetak PDF) |
| Staf, pengawas, siswa | Tidak ada akses |

## Yang perlu dilakukan (urut)
1. **Project presensi siswa** (`sfuucjmnlmfcghobpnkf`) -> Edge Functions -> buat fungsi **`presensi-siswa-api`**, isi dengan
   `presensi-siswa-backend/presensi-siswa-api.ts`. Detail fungsi -> **Verify JWT: OFF**.
   Secrets (sama dengan fungsi `presensi-api`):
   - `RAPOR_URL` = `https://iejpwxmcqwecejsrezry.supabase.co`
   - `RAPOR_ANON_KEY` = kunci publishable/anon project e-Rapor (kunci publik, BUKAN service_role)
2. Masih di project itu -> SQL Editor -> jalankan `presensi-siswa-backend/setup.sql`. Aman: bila tabel `pres_*` sudah ada
   (dari aplikasi lama), tidak ada yang berubah dan data presensi lama tetap.
3. Unggah (push) repo **pdp**: `presensi-siswa.html`, `akses-guard.js`, `portal.html`, `bottomnav.js`, `app-switcher.js`,
   `desktop/scripts/prepare.js`, dan folder `presensi-siswa-backend/` (folder ini tidak ikut ke aplikasi Windows).
4. **Uji dulu** sebelum langkah 5: masuk sebagai admin -> Menu Utama -> **Presensi Siswa** -> tab **Sinkron** -> Sinkronkan;
   lalu masuk sebagai wali kelas dan coba isi + simpan presensi, buka rekap, unduh PDF.
5. Setelah semua OK: jalankan `presensi-siswa-backend/kunci.sql` di project presensi siswa. Ini menutup tabel `pres_*` dari
   kunci anon, jadi hanya Edge Function yang bisa mengaksesnya. **Halaman lama `presensi-siswa-pdf.html` berhenti
   berfungsi setelah ini**; hapus dari hosting.
6. (Opsional) Kunci/sembunyikan dari Developer: jalankan `migrasi_presensi_siswa_akses.sql` di Supabase **PDP**
   (syarat: `migrasi_developer.sql` sudah dijalankan). Presensi Siswa lalu muncul di developer.html -> Akses Aplikasi.

## Perubahan perilaku dibanding aplikasi lama
- **Simpan manual:** tombol Sakit/Ijin/Tanpa Ket. mengubah tampilan dulu, perubahan tersimpan saat menekan **Simpan presensi**
  (satu panggilan per kelas per hari, dan ada peringatan bila pindah halaman sebelum menyimpan). Sebelumnya setiap klik
  langsung tersimpan.
- **Sinkron e-Rapor tanpa email/sandi:** dibaca di server memakai sesi admin yang sedang masuk. Bila e-Rapor tidak
  mengembalikan data siswa, sinkron dibatalkan dan data lama tidak dihapus.
- Wali kelas yang belum tercatat di `wali_kelas` (atau kelasnya belum disinkron) melihat pesan "hanya untuk wali kelas".
- Kelas/siswa manual dan penghapusannya hanya admin. Pengaturan cetak PDF (nama sekolah, kepala sekolah, NIP) tetap
  tersimpan di browser; untuk wali kelas, nama dan NIP otomatis diisi dari akunnya bila kosong.
- Mode **Lihat sebagai** (developer): hanya baca.
- Perubahan pada `bottomnav.js` / `akses-guard.js` / `app-switcher.js` bisa tertunda beberapa menit di browser karena cache.
