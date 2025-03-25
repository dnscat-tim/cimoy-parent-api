const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');

// Data waktu layar untuk testing
const screenTimeData = [
  {
    id: 1,
    childId: 1,
    dayOfWeek: 1, // Senin
    startTime: '08:00',
    endTime: '20:00',
    maxUsage: 120 // menit
  },
  {
    id: 2,
    childId: 1,
    dayOfWeek: 2, // Selasa
    startTime: '08:00',
    endTime: '20:00',
    maxUsage: 120
  },
  {
    id: 3,
    childId: 1,
    dayOfWeek: 3, // Rabu
    startTime: '08:00',
    endTime: '20:00',
    maxUsage: 120
  },
  {
    id: 4,
    childId: 1,
    dayOfWeek: 4, // Kamis
    startTime: '08:00',
    endTime: '20:00',
    maxUsage: 120
  },
  {
    id: 5,
    childId: 1,
    dayOfWeek: 5, // Jumat
    startTime: '08:00',
    endTime: '20:00',
    maxUsage: 120
  },
  {
    id: 6,
    childId: 1,
    dayOfWeek: 6, // Sabtu
    startTime: '09:00',
    endTime: '21:00',
    maxUsage: 180
  },
  {
    id: 7,
    childId: 1,
    dayOfWeek: 0, // Minggu
    startTime: '09:00',
    endTime: '21:00',
    maxUsage: 180
  }
];

/**
 * @route GET /api/screen-time/:childId
 * @desc Mendapatkan pengaturan waktu layar untuk anak tertentu
 * @access Private
 */
router.get('/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  const screenTimes = screenTimeData.filter(st => st.childId === childId);
  
  if (screenTimes.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Pengaturan waktu layar tidak ditemukan'
    });
  }
  
  res.json({
    success: true,
    data: screenTimes
  });
});

/**
 * @route PUT /api/screen-time/:childId
 * @desc Memperbarui pengaturan waktu layar untuk anak tertentu
 * @access Private (hanya untuk orang tua)
 */
router.put('/:childId', auth, (req, res) => {
  // Periksa apakah user adalah orang tua
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang dapat memperbarui pengaturan waktu layar'
    });
  }
  
  const childId = parseInt(req.params.childId);
  const { screenTimes } = req.body;
  
  if (!screenTimes || !Array.isArray(screenTimes)) {
    return res.status(400).json({
      success: false,
      message: 'Format data tidak valid'
    });
  }
  
  // Validasi setiap pengaturan waktu layar
  for (const st of screenTimes) {
    if (
      !Number.isInteger(st.dayOfWeek) || 
      st.dayOfWeek < 0 || 
      st.dayOfWeek > 6 ||
      !st.startTime ||
      !st.endTime ||
      !Number.isInteger(st.maxUsage) ||
      st.maxUsage < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Format data tidak valid'
      });
    }
  }
  
  // Update pengaturan waktu layar
  for (const st of screenTimes) {
    const index = screenTimeData.findIndex(
      data => data.childId === childId && data.dayOfWeek === st.dayOfWeek
    );
    
    if (index !== -1) {
      // Update pengaturan yang sudah ada
      screenTimeData[index] = {
        ...screenTimeData[index],
        startTime: st.startTime,
        endTime: st.endTime,
        maxUsage: st.maxUsage
      };
    } else {
      // Tambahkan pengaturan baru
      screenTimeData.push({
        id: screenTimeData.length + 1,
        childId,
        dayOfWeek: st.dayOfWeek,
        startTime: st.startTime,
        endTime: st.endTime,
        maxUsage: st.maxUsage
      });
    }
  }
  
  res.json({
    success: true,
    message: 'Pengaturan waktu layar berhasil diperbarui',
    data: screenTimeData.filter(st => st.childId === childId)
  });
});

/**
 * @route POST /api/screen-time/usage/:childId
 * @desc Menyimpan data penggunaan waktu layar dari perangkat anak
 * @access Private (hanya untuk perangkat anak)
 */
router.post('/usage/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  const { usageTime, date } = req.body;
  
  if (!usageTime || !date) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak lengkap'
    });
  }
  
  // Verifikasi format data
  if (!Number.isInteger(usageTime) || usageTime < 0) {
    return res.status(400).json({
      success: false,
      message: 'Format waktu penggunaan tidak valid'
    });
  }
  
  // Simpan data penggunaan waktu layar (dalam implementasi sebenarnya akan disimpan ke database)
  
  res.json({
    success: true,
    message: 'Data penggunaan waktu layar berhasil disimpan'
  });
});

/**
 * @route GET /api/screen-time/status/:childId
 * @desc Mendapatkan status waktu layar saat ini untuk anak tertentu
 * @access Private
 */
router.get('/status/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  
  // Dapatkan hari dan waktu saat ini
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Minggu, 1 = Senin, dst.
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  // Cari pengaturan untuk hari ini
  const todaySettings = screenTimeData.find(st => st.childId === childId && st.dayOfWeek === dayOfWeek);
  
  if (!todaySettings) {
    return res.status(404).json({
      success: false,
      message: 'Pengaturan untuk hari ini tidak ditemukan'
    });
  }
  
  // Cek apakah saat ini dalam waktu yang diizinkan
  const isAllowed = currentTime >= todaySettings.startTime && currentTime <= todaySettings.endTime;
  
  res.json({
    success: true,
    data: {
      isAllowed,
      todaySettings,
      currentTime,
      dayOfWeek,
      remainingTime: isAllowed ? todaySettings.maxUsage : 0 // Dalam implementasi sebenarnya, hitung waktu yang tersisa
    }
  });
});

module.exports = router; 