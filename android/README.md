# PDP Wima — Android

Pembungkus (WebView) untuk portal `https://smkwima.github.io/pdp/`.
Isi aplikasi selalu diambil dari situs, jadi perubahan web otomatis ikut tanpa memasang ulang APK.

## Cara membuat APK
1. Push repo ke GitHub, buka tab **Actions** -> **Build Aplikasi Android** -> **Run workflow**.
2. Setelah selesai, unduh `PDP-Wima-Android` dari bagian Artifacts, ekstrak, lalu pasang `PDP-Wima-Android.apk` di HP
   (izinkan "pasang dari sumber tidak dikenal").
3. Atau buat tag `v1.0.1` -> APK otomatis masuk ke Releases.

Lokal (butuh JDK 17 + Android SDK + Gradle 8.9): `cd android && gradle assembleRelease`.

## Catatan
- Android 10 ke atas (minSdk 29).
- Tidak fullscreen: bar status dan navigasi HP tetap terlihat. Warna latar bar: `res/values/colors.xml` (`pdp_bg`).
- Tidak ada indikator online/offline.
- Cetak: dialog cetak Android -> "Simpan sebagai PDF"; nama berkas mengikuti judul dokumen.
- Unduhan (PDF/Excel/gambar) tersimpan di folder Download.
- `app/pdp-wima.jks` = kunci tanda tangan APK. Simpan baik-baik; dengan kunci yang sama, versi baru bisa menimpa versi lama.
  Naikkan `versionCode` di `app/build.gradle.kts` setiap merilis versi baru.
- Ganti alamat portal di `MainActivity.kt` (`HOST`, `URL_AWAL`) bila situs pindah.
