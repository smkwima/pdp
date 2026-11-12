# Aplikasi Ijin & Dinas Luar (disimpan di database Rekap Absen)

Guru/staf mengisi **jenis (Sakit / Ijin / Dinas Luar), tanggal, deskripsi** di pdp (menu **Ijin & Dinas Luar**).
Data disimpan di database **Rekap Absen** (tabel `absen_ijin`) dan otomatis muncul di Rekap Absen.

Urutan (jangan dibalik):

1. **Project Rekap Absen** → SQL Editor → jalankan `rekap_ijin.sql`
   (membuat tabel `absen_ijin`; halaman rekap hanya boleh membaca, kolom deskripsi tidak bisa dibaca publik).
   Lalu jalankan **`rekap_ijin_persetujuan.sql`** (menambah kolom status persetujuan; pengajuan lama otomatis dianggap *disetujui*).
2. **Project pdp** → deploy Edge Function baru:
   `supabase functions deploy ijin-absen`
   (atau Dashboard → Edge Functions → buat `ijin-absen`, isi dengan `supabase/functions/ijin-absen/index.ts`).
   Secrets `REKAP_SUPABASE_URL` dan `REKAP_SERVICE_KEY` SUDAH ada dari sinkron kode mesin, tidak perlu diisi lagi.
3. Upload file web: `ijin.html`, `portal.html`, `app-switcher.js`, `supabase-client.js`
   dan semua halaman yang memuat `app-switcher.js?v=4` (angka versi naik agar menu baru muncul),
   serta `rekap-absen-fingerprint.html` (versi baru).

Syarat tiap akun: kolom **Kode Mesin** di Guru & Penugasan sudah terisi (sama dengan No.ID fingerprint).
Tanpa kode mesin, pengajuan ditolak dengan pesan yang jelas.

## Aturan di Rekap Absen
- Pada tanggal ijin, **jika tidak ada scan** dan hari itu terjadwal, status menjadi Sakit / Ijin / Dinas luar (warna biru), tidak dihitung "Tidak hadir".
- Jika pada tanggal itu ada scan, penilaian tetap memakai scan seperti biasa.
- Akhir pekan, hari libur, dan hari tanpa jadwal otomatis diabaikan.
- Ringkasan per guru, Detail, Excel, PDF, dan "Simpan rekap" punya kolom Sakit / Ijin / Dinas luar.
- Setelah guru mengirim pengajuan, klik **Muat dari database** di Rekap Absen untuk menarik data terbaru.

## Hak akses
- Guru/staf: ajukan, lihat progres, dan batalkan/hapus pengajuan sendiri **selama belum disetujui**.
- Admin: melihat semua pengajuan, **menyetujui / menolak satu per satu atau "Setujui semua"**, bisa menghapus siapa pun. Pengajuan admin sendiri langsung disetujui. Kepala sekolah: hanya melihat.
- Aturan: satu pengajuan maksimal 90 hari; boleh mengisi mundur sampai 120 hari; pengajuan yang tanggalnya bertabrakan ditolak.

## Rekap Absen dibuka lewat pdp
Menu **Rekap Absen Fingerprint** (khusus admin) ada di Menu Utama, di panel "Aplikasi" pada topbar, dan di "Semua Aplikasi" di HP.
Isinya link ke https://wima15.github.io/rekap-presensi/ (terbuka di tab baru).
Upload `rekap-absen-fingerprint.html` versi baru ke repo GitHub `rekap-presensi` (sebagai `index.html`) agar fitur ijin tampil.
Upload ulang semua halaman pdp (angka versi `app-switcher.js` dan `bottomnav.js` naik ke v=5).

## Persetujuan admin
- Pengajuan baru berstatus **Menunggu persetujuan** dan **belum** memengaruhi Rekap Absen.
- Progres yang dilihat guru: Diajukan → Menunggu admin → Disetujui / Ditolak (lengkap dengan nama admin, waktu, dan alasan bila ditolak).
- Admin: menu **Persetujuan Ijin** (ada angka jumlah yang menunggu). Tombol **Setujui** / **Tolak** per baris, dan **Setujui semua** (hanya yang menunggu dan sesuai filter bulan/jenis/nama yang sedang aktif).
- Admin juga bisa **Batalkan** persetujuan yang sudah diberikan (jadi Ditolak) atau menyetujui ulang pengajuan yang ditolak.
- Rekap Absen (`index.html` repo rekap-presensi) **tidak perlu diubah**: policy database kini hanya mengizinkan baca baris berstatus *disetujui*.
- Urutan deploy: SQL → Edge Function `ijin-absen` → upload `ijin.html`.
