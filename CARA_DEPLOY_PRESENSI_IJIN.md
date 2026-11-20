# Presensi membaca Ijin / Sakit / Dinas Luar

Pengajuan di menu **Ijin & Dinas Luar** (tersimpan di database Rekap Absen, tabel `absen_ijin`) sekarang ikut dibaca
aplikasi Presensi. Yang dibaca hanya pengajuan berstatus **disetujui**.

## Yang berubah
- **Layar Presensi (guru/staf):** bila hari ini tercatat Sakit / Ijin / Dinas Luar dan belum ada presensi, kamera tidak
  dibuka; tampil keterangan jenisnya dan kotak Datang/Pulang berlabel jenis tersebut. Server juga menolak presensi pada
  kondisi itu (pesan 409). Jika pegawai sudah terlanjur presensi (masuk walau ijin), presensi tetap diterima seperti biasa.
- **Rekap Presensi Online (admin & kepala sekolah):** pegawai yang ijin tampil berlabel Sakit / Ijin / Dinas Luar
  (bukan "Belum"), ada kartu **Sakit / Ijin / DL**, dan jumlah "Belum datang" tidak lagi menghitung mereka.
- Pegawai dicocokkan lewat **Kode Mesin** (sama dengan No.ID fingerprint), seperti di Rekap Absen.

## Yang perlu dilakukan (urut)
1. **Project Presensi** (`nrwexyezcbmsokelgkmp`) -> Edge Functions -> **Secrets**, tambahkan:
   - `REKAP_URL` = alamat project Supabase **Rekap Absen** (https://xxxx.supabase.co)
   - `REKAP_ANON_KEY` = kunci publishable/anon project Rekap Absen (kunci publik; BUKAN service_role)
   Kunci anon ini sama dengan yang dipakai halaman Rekap Absen dan hanya bisa membaca baris `disetujui`
   (kolom deskripsi alasan tidak terbaca).
2. Deploy ulang Edge Function `presensi-api` dengan isi `presensi-backend/presensi-api.ts` yang baru
   (Verify JWT tetap OFF).
3. Unggah `presensi.html` yang baru.
4. Tidak ada SQL baru. Syarat sebelumnya tetap: `rekap_ijin.sql` dan `rekap_ijin_persetujuan.sql` sudah dijalankan di Rekap Absen.

Jika secret belum diisi, Presensi tetap berjalan normal; hanya ijin yang tidak terbaca dan rekap menampilkan
peringatan "Data ijin belum terbaca".
