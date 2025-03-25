const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');

// Contoh data aplikasi untuk testing (nantinya akan diganti dengan database)
const appsData = [
  {
    id: 1,
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    category: 'social',
    isBlocked: false,
    usageLimit: 60, // dalam menit
  },
  {
    id: 2,
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    category: 'entertainment',
    isBlocked: true,
    usageLimit: 30,
  },
  {
    id: 3,
    name: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    category: 'social',
    isBlocked: false,
    usageLimit: 45,
  }
];

/**
 * @route GET /api/apps
 * @desc Mendapatkan daftar semua aplikasi
 * @access Private (hanya untuk orang tua)
 */
router.get('/', auth, (req, res) => {
  res.json({
    success: true,
    data: appsData
  });
});

/**
 * @route GET /api/apps/:id
 * @desc Mendapatkan detail aplikasi berdasarkan ID
 * @access Private
 */
router.get('/:id', auth, (req, res) => {
  const appId = parseInt(req.params.id);
  const app = appsData.find(app => app.id === appId);
  
  if (!app) {
    return res.status(404).json({
      success: false,
      message: 'Aplikasi tidak ditemukan'
    });
  }
  
  res.json({
    success: true,
    data: app
  });
});

/**
 * @route POST /api/apps/block/:id
 * @desc Memblokir aplikasi berdasarkan ID
 * @access Private (hanya untuk orang tua)
 */
router.post('/block/:id', auth, (req, res) => {
  const appId = parseInt(req.params.id);
  const appIndex = appsData.findIndex(app => app.id === appId);
  
  if (appIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Aplikasi tidak ditemukan'
    });
  }
  
  // Update status pemblokiran
  appsData[appIndex].isBlocked = true;
  
  res.json({
    success: true,
    message: 'Aplikasi berhasil diblokir',
    data: appsData[appIndex]
  });
});

/**
 * @route POST /api/apps/unblock/:id
 * @desc Membuka blokir aplikasi berdasarkan ID
 * @access Private (hanya untuk orang tua)
 */
router.post('/unblock/:id', auth, (req, res) => {
  const appId = parseInt(req.params.id);
  const appIndex = appsData.findIndex(app => app.id === appId);
  
  if (appIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Aplikasi tidak ditemukan'
    });
  }
  
  // Update status pemblokiran
  appsData[appIndex].isBlocked = false;
  
  res.json({
    success: true,
    message: 'Blokir aplikasi berhasil dibuka',
    data: appsData[appIndex]
  });
});

/**
 * @route PUT /api/apps/limit/:id
 * @desc Mengatur batas waktu penggunaan aplikasi
 * @access Private (hanya untuk orang tua)
 */
router.put('/limit/:id', auth, (req, res) => {
  const appId = parseInt(req.params.id);
  const { usageLimit } = req.body;
  
  if (!usageLimit || isNaN(usageLimit)) {
    return res.status(400).json({
      success: false,
      message: 'Batas waktu penggunaan tidak valid'
    });
  }
  
  const appIndex = appsData.findIndex(app => app.id === appId);
  
  if (appIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Aplikasi tidak ditemukan'
    });
  }
  
  // Update batas waktu penggunaan
  appsData[appIndex].usageLimit = parseInt(usageLimit);
  
  res.json({
    success: true,
    message: 'Batas waktu penggunaan berhasil diperbarui',
    data: appsData[appIndex]
  });
});

/**
 * @route POST /api/apps/usage
 * @desc Menyimpan data penggunaan aplikasi dari perangkat anak
 * @access Private (hanya untuk perangkat anak)
 */
router.post('/usage', auth, (req, res) => {
  const { appUsage } = req.body;
  
  if (!appUsage || !Array.isArray(appUsage)) {
    return res.status(400).json({
      success: false,
      message: 'Format data penggunaan aplikasi tidak valid'
    });
  }
  
  // Tindakan penyimpanan ke database akan ditambahkan nanti
  
  res.json({
    success: true,
    message: 'Data penggunaan aplikasi berhasil disimpan'
  });
});

module.exports = router; 