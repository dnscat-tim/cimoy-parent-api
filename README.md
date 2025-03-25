# CIMOY Parent

Aplikasi Monitoring dan Parental Control untuk Orang Tua

## Deskripsi

CIMOY Parent adalah aplikasi parental control yang memungkinkan orang tua untuk memantau dan mengontrol penggunaan perangkat anak. Aplikasi ini berpasangan dengan CIMOY Kids yang diinstal pada perangkat anak.

## Fitur Utama

- **Pantau Lokasi**: Lacak lokasi perangkat anak secara real-time
- **Kontrol Aplikasi**: Blokir atau batasi penggunaan aplikasi tertentu
- **Laporan Penggunaan**: Lihat berapa lama anak menggunakan aplikasi tertentu
- **Filter Konten**: Lindungi anak dari konten berbahaya
- **Batasan Waktu Layar**: Atur kapan dan berapa lama anak dapat menggunakan perangkat
- **Auto-Install CIMOY Kids**: Instal aplikasi CIMOY Kids secara otomatis pada perangkat anak

## Instalasi

### Prasyarat

- Android 7.0 (Nougat) atau lebih tinggi
- Koneksi internet aktif
- Izin lokasi dan notifikasi

### Langkah Instalasi

1. Unduh APK CIMOY Parent dari website resmi
2. Izinkan instalasi dari sumber tidak dikenal di pengaturan keamanan perangkat
3. Instal aplikasi dan ikuti petunjuk pengaturan awal

## Penggunaan

### Menghubungkan ke Perangkat Anak

1. Buka aplikasi CIMOY Parent
2. Pada halaman utama, pilih "Tambah Perangkat"
3. Ikuti panduan untuk menginstal CIMOY Kids pada perangkat anak
4. Pindai kode QR yang ditampilkan pada perangkat anak, atau masukkan kode koneksi secara manual
5. Setelah terhubung, Anda akan melihat perangkat anak pada dashboard

### Pantau Lokasi

1. Pilih perangkat anak dari daftar
2. Buka tab "Lokasi" untuk melihat lokasi anak secara real-time
3. Anda juga dapat melihat riwayat lokasi dengan memilih rentang tanggal tertentu

### Kontrol Aplikasi

1. Pilih perangkat anak dari daftar
2. Buka tab "Aplikasi" untuk melihat daftar aplikasi yang terpasang
3. Untuk memblokir aplikasi, geser tombol di sebelah aplikasi tersebut
4. Anda juga dapat mengatur batasan waktu penggunaan untuk setiap aplikasi

### Batasan Waktu Layar

1. Pilih perangkat anak dari daftar
2. Buka tab "Waktu Layar"
3. Atur jadwal dan durasi penggunaan perangkat harian
4. Anda dapat membuat aturan berbeda untuk hari sekolah dan akhir pekan

## Keamanan dan Privasi

CIMOY Parent mengutamakan keamanan dan privasi data:

- Semua komunikasi dienkripsi end-to-end
- Data disimpan secara lokal, bukan di cloud
- Tidak ada data yang dibagikan ke pihak ketiga
- Aplikasi menampilkan indikator saat pemantauan aktif

## Mengatasi Masalah Umum

### Perangkat Anak Terputus

1. Periksa apakah perangkat anak terhubung ke internet
2. Pastikan CIMOY Kids masih berjalan di latar belakang
3. Coba hubungkan kembali dengan menekan tombol "Hubungkan Ulang"
4. Jika masalah berlanjut, coba instal ulang CIMOY Kids

### Aplikasi tidak Terpantau

1. Pastikan CIMOY Kids memiliki izin Aksesibilitas yang diperlukan
2. Periksa apakah fitur penghemat baterai tidak membatasi CIMOY Kids
3. Pastikan CIMOY Kids ditambahkan ke daftar pengecualian optimasi baterai

### Tidak Bisa Menginstal CIMOY Kids Secara Otomatis

1. Pastikan fitur "Instal Otomatis" diaktifkan di pengaturan CIMOY Parent
2. Periksa apakah koneksi internet stabil
3. Pastikan perangkat anak memiliki ruang penyimpanan yang cukup
4. Coba instal secara manual dengan mengunduh APK dari CIMOY Parent

## Teknologi

CIMOY Parent dibangun menggunakan:

- Capacitor untuk kerangka aplikasi lintas platform
- Socket.IO untuk komunikasi real-time
- Steganografi untuk menyembunyikan APK dalam gambar
- CryptoJS untuk enkripsi data
- TailwindCSS untuk antarmuka pengguna

## Pengembangan

### Struktur Proyek

```
cimoy-parent-app/
├── android/          # File konfigurasi Android
├── public/           # Aset publik
├── scripts/          # Script utilitas
│   ├── apk-to-image.js  # Konversi APK ke gambar
├── src/
│   ├── assets/       # Gambar dan aset lainnya
│   ├── components/   # Komponen UI yang dapat digunakan kembali
│   ├── pages/        # Halaman utama aplikasi
│   ├── services/     # Layanan untuk fitur utama
│   │   ├── ApkPackager.js          # Pengelolaan APK
│   │   ├── KidsConnectionManager.js # Koneksi ke CIMOY Kids
│   ├── utils/        # Fungsi pembantu
├── capacitor.config.json  # Konfigurasi Capacitor
└── package.json      # Dependensi NPM
```

### Membangun dari Sumber

1. Kloning repositori:
   ```bash
   git clone https://github.com/tracasstudio/cimoy-parent.git
   cd cimoy-parent
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Jalankan dalam mode pengembangan:
   ```bash
   npm run start
   ```

4. Bangun untuk Android:
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```

## Kontribusi

Kami menyambut kontribusi dari komunitas! Silakan buat pull request atau buka isu untuk melaporkan bug atau menyarankan fitur baru.

## Lisensi

© 2023 dnsCat Tracas Studio. Semua hak dilindungi undang-undang.

---

Dibuat dengan ❤️ oleh Tim CIMOY 