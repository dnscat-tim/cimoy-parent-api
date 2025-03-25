/**
 * Script untuk mengkonversi APK CIMOY Kids menjadi gambar menggunakan steganografi
 * 
 * Alat ini akan menyembunyikan APK dalam file gambar
 * dan menghasilkan kode untuk mengekstrak kembali APK dari gambar
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const steggy = require('steggy');

// Konfigurasi
const APK_PATH = path.join(__dirname, '../src/assets/cimoy-kids.apk');
const OUTPUT_DIR = path.join(__dirname, '../dist/steganography');
const COVER_IMAGES_DIR = path.join(__dirname, '../src/assets/covers');
const PASSWORD = process.env.STEG_PASSWORD || 'c1m0y-s3cur3-k3y';

// Pastikan direktori output ada
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Periksa apakah APK ada
if (!fs.existsSync(APK_PATH)) {
  console.error('❌ File APK tidak ditemukan di:', APK_PATH);
  process.exit(1);
}

/**
 * Fungsi untuk memeriksa kesesuaian checksum file
 */
function verifyChecksum(filePath, expectedChecksum) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const actualChecksum = hashSum.digest('hex');
  
  return actualChecksum === expectedChecksum;
}

/**
 * Fungsi untuk memecah file besar menjadi beberapa bagian
 */
function splitFile(filePath, numParts) {
  const fileSize = fs.statSync(filePath).size;
  const chunkSize = Math.ceil(fileSize / numParts);
  const fileContent = fs.readFileSync(filePath);
  const chunks = [];
  
  for (let i = 0; i < numParts; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, fileSize);
    
    if (start < fileSize) {
      chunks.push(fileContent.slice(start, end));
    }
  }
  
  return chunks;
}

/**
 * Fungsi untuk menyembunyikan data dalam gambar
 */
async function hideDataInImage(imageBuffer, dataChunk, password) {
  return new Promise((resolve, reject) => {
    try {
      const result = steggy.hide({
        data: dataChunk,
        carrier: imageBuffer,
        password,
        compress: true,
        encrypt: true,
      });
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Fungsi untuk mendapatkan daftar gambar cover yang tersedia
 */
function getCoverImages() {
  if (!fs.existsSync(COVER_IMAGES_DIR)) {
    console.log('⚠️ Direktori gambar cover tidak ditemukan, membuat direktori baru...');
    fs.mkdirSync(COVER_IMAGES_DIR, { recursive: true });
    
    // Menyalin beberapa gambar default jika ada
    try {
      const defaultImagesDir = path.join(__dirname, '../public/assets');
      if (fs.existsSync(defaultImagesDir)) {
        const imageFiles = fs.readdirSync(defaultImagesDir)
          .filter(file => /\.(jpg|jpeg|png)$/i.test(file));
        
        imageFiles.forEach(file => {
          fs.copyFileSync(
            path.join(defaultImagesDir, file),
            path.join(COVER_IMAGES_DIR, file)
          );
        });
        
        console.log(`✅ Menyalin ${imageFiles.length} gambar default sebagai cover.`);
      }
    } catch (error) {
      console.error('⚠️ Gagal menyalin gambar default:', error.message);
    }
  }
  
  // Cari semua file gambar di direktori cover
  return fs.readdirSync(COVER_IMAGES_DIR)
    .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
    .map(file => path.join(COVER_IMAGES_DIR, file));
}

/**
 * Fungsi utama untuk melakukan konversi APK ke gambar
 */
async function convertApkToImages() {
  console.log('🚀 Memulai konversi APK ke gambar...');
  
  // Baca file APK
  const apkData = fs.readFileSync(APK_PATH);
  const apkSize = apkData.length;
  console.log(`📊 Ukuran APK: ${(apkSize / (1024 * 1024)).toFixed(2)} MB`);
  
  // Hitung checksum APK
  const hashSum = crypto.createHash('sha256');
  hashSum.update(apkData);
  const checksumHex = hashSum.digest('hex');
  
  // Simpan checksum untuk verifikasi
  fs.writeFileSync(path.join(OUTPUT_DIR, 'apk.sha256'), checksumHex);
  console.log(`🔐 Checksum APK: ${checksumHex}`);
  
  // Dapatkan daftar gambar cover
  const coverImages = getCoverImages();
  
  if (coverImages.length === 0) {
    console.error('❌ Tidak ada gambar cover yang tersedia!');
    console.error('Tambahkan gambar JPG atau PNG ke direktori:', COVER_IMAGES_DIR);
    process.exit(1);
  }
  
  console.log(`🖼️ Menemukan ${coverImages.length} gambar cover.`);
  
  // Tentukan jumlah bagian berdasarkan jumlah gambar cover
  // Jika terlalu sedikit gambar untuk ukuran APK, bagi menjadi lebih banyak bagian
  const avgImageCapacity = 3 * 1024 * 1024; // Kapasitas rata-rata (3MB per gambar)
  const requiredParts = Math.ceil(apkSize / avgImageCapacity);
  const numParts = Math.max(requiredParts, coverImages.length);
  
  // Bagi APK menjadi beberapa bagian
  console.log(`📦 Membagi APK menjadi ${numParts} bagian...`);
  const apkChunks = splitFile(APK_PATH, numParts);
  
  // Informasi manifest untuk merekonstruksi APK
  const manifest = {
    totalParts: apkChunks.length,
    checksum: checksumHex,
    fileName: 'cimoy-kids.apk',
    totalSize: apkSize,
    parts: []
  };
  
  // Proses setiap bagian dan simpan dalam gambar
  console.log('🔄 Menyembunyikan data APK dalam gambar...');
  
  for (let i = 0; i < apkChunks.length; i++) {
    // Pilih gambar cover (gunakan ulang jika perlu)
    const coverIndex = i % coverImages.length;
    const coverPath = coverImages[coverIndex];
    const coverFileName = path.basename(coverPath);
    
    // Baca gambar cover
    const coverImageBuffer = fs.readFileSync(coverPath);
    
    // Buat nama output dengan indeks
    const outputFileName = `cimoy_${i + 1}_${coverFileName}`;
    const outputPath = path.join(OUTPUT_DIR, outputFileName);
    
    try {
      // Sembunyikan bagian APK dalam gambar
      console.log(`📝 Memproses bagian ${i + 1}/${apkChunks.length} dengan cover: ${coverFileName}`);
      
      const resultImageBuffer = await hideDataInImage(
        coverImageBuffer,
        apkChunks[i],
        PASSWORD + i // Gunakan password unik per bagian
      );
      
      // Simpan gambar hasil
      fs.writeFileSync(outputPath, resultImageBuffer);
      
      // Tambahkan informasi ke manifest
      manifest.parts.push({
        index: i,
        fileName: outputFileName,
        size: apkChunks[i].length,
        password: PASSWORD + i
      });
      
      console.log(`✅ Bagian ${i + 1} berhasil disimpan ke: ${outputFileName}`);
    } catch (error) {
      console.error(`❌ Gagal menyembunyikan data di bagian ${i + 1}:`, error);
      process.exit(1);
    }
  }
  
  // Simpan manifest
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  // Buat script ekstraksi
  const extractorScript = `
/**
 * Script ekstraksi CIMOY Kids APK dari gambar
 * Dibuat otomatis oleh CIMOY APK-to-Image Converter
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const steggy = require('steggy');

// Konfigurasi
const IMAGES_DIR = path.resolve(__dirname);
const OUTPUT_APK = path.join(IMAGES_DIR, 'cimoy-kids.apk');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

// Baca manifest
if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('❌ File manifest.json tidak ditemukan!');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
console.log(\`🚀 Memulai ekstraksi APK CIMOY Kids dari \${manifest.totalParts} gambar...\`);

// Alokasi buffer untuk seluruh APK
const apkBuffer = Buffer.alloc(manifest.totalSize);
let currentPosition = 0;

// Ekstrak data dari setiap gambar
for (let i = 0; i < manifest.parts.length; i++) {
  const part = manifest.parts[i];
  const imagePath = path.join(IMAGES_DIR, part.fileName);
  
  if (!fs.existsSync(imagePath)) {
    console.error(\`❌ Gambar tidak ditemukan: \${part.fileName}\`);
    process.exit(1);
  }
  
  try {
    console.log(\`📝 Mengekstrak bagian \${i + 1}/\${manifest.totalParts} dari: \${part.fileName}\`);
    
    // Baca gambar
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Ekstrak data dari gambar
    const extractedData = steggy.reveal({
      carrier: imageBuffer,
      password: part.password,
      decrypt: true,
      decompress: true
    });
    
    // Salin ke buffer utama
    extractedData.copy(apkBuffer, currentPosition);
    currentPosition += extractedData.length;
    
    console.log(\`✅ Bagian \${i + 1} berhasil diekstrak (\${extractedData.length} bytes)\`);
  } catch (error) {
    console.error(\`❌ Gagal mengekstrak data dari bagian \${i + 1}:\`, error);
    process.exit(1);
  }
}

// Simpan APK hasil
fs.writeFileSync(OUTPUT_APK, apkBuffer);
console.log(\`✅ APK berhasil diekstrak ke: \${OUTPUT_APK}\`);

// Verifikasi checksum
const hashSum = crypto.createHash('sha256');
hashSum.update(apkBuffer);
const actualChecksum = hashSum.digest('hex');

if (actualChecksum === manifest.checksum) {
  console.log('✅ Verifikasi checksum berhasil! APK utuh dan tidak termodifikasi.');
  console.log('🎉 APK CIMOY Kids siap digunakan.');
} else {
  console.error('❌ Verifikasi checksum gagal! APK mungkin rusak atau termodifikasi.');
  console.error('Harap ulangi proses ekstraksi.');
}
  `.trim();
  
  // Simpan script ekstraksi
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'extract.js'),
    extractorScript
  );
  
  console.log('📜 Script ekstraksi berhasil dibuat.');
  console.log('🎉 Konversi APK ke gambar selesai!');
  console.log('-------------');
  console.log('Hasil konversi:');
  console.log(`1. Gambar steganografi: ${manifest.parts.length} file`);
  console.log(`2. File manifest: manifest.json`);
  console.log(`3. Script ekstraksi: extract.js`);
  console.log('-------------');
  console.log('Untuk mengekstrak APK dari gambar:');
  console.log('1. Salin semua gambar hasil, manifest.json, dan extract.js ke direktori yang sama');
  console.log('2. Jalankan: node extract.js');
  console.log('-------------');
  console.log(`Semua file output disimpan di: ${OUTPUT_DIR}`);
}

// Jalankan fungsi utama
convertApkToImages().catch(error => {
  console.error('❌ Terjadi kesalahan:', error);
  process.exit(1);
}); 