const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { config } = require('../config/environment');

// Data filter konten untuk testing
const contentFiltersData = [
  {
    id: 1,
    childId: 1,
    filterType: 'pornografi',
    isEnabled: true,
    sensitivity: 85
  },
  {
    id: 2,
    childId: 1,
    filterType: 'kekerasan',
    isEnabled: true,
    sensitivity: 75
  },
  {
    id: 3,
    childId: 1,
    filterType: 'perundungan',
    isEnabled: true,
    sensitivity: 80
  }
];

/**
 * @route GET /api/content-filter/:childId
 * @desc Mendapatkan pengaturan filter konten untuk anak tertentu
 * @access Private
 */
router.get('/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  const filters = contentFiltersData.filter(filter => filter.childId === childId);
  
  res.json({
    success: true,
    data: filters
  });
});

/**
 * @route PUT /api/content-filter/:childId
 * @desc Memperbarui pengaturan filter konten untuk anak tertentu
 * @access Private (hanya untuk orang tua)
 */
router.put('/:childId', auth, (req, res) => {
  // Periksa apakah user adalah orang tua
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang dapat memperbarui pengaturan filter konten'
    });
  }
  
  const childId = parseInt(req.params.childId);
  const { filters } = req.body;
  
  if (!filters || !Array.isArray(filters)) {
    return res.status(400).json({
      success: false,
      message: 'Format data tidak valid'
    });
  }
  
  // Update pengaturan filter konten
  for (const filter of filters) {
    if (!filter.filterType || filter.isEnabled === undefined || !Number.isInteger(filter.sensitivity)) {
      return res.status(400).json({
        success: false,
        message: 'Format data tidak valid'
      });
    }
    
    const index = contentFiltersData.findIndex(
      f => f.childId === childId && f.filterType === filter.filterType
    );
    
    if (index !== -1) {
      // Update pengaturan yang sudah ada
      contentFiltersData[index] = {
        ...contentFiltersData[index],
        isEnabled: filter.isEnabled,
        sensitivity: filter.sensitivity
      };
    } else {
      // Tambahkan pengaturan baru
      contentFiltersData.push({
        id: contentFiltersData.length + 1,
        childId,
        filterType: filter.filterType,
        isEnabled: filter.isEnabled,
        sensitivity: filter.sensitivity
      });
    }
  }
  
  res.json({
    success: true,
    message: 'Pengaturan filter konten berhasil diperbarui',
    data: contentFiltersData.filter(f => f.childId === childId)
  });
});

/**
 * @route POST /api/content-filter/analyze
 * @desc Menganalisis konten untuk mendeteksi konten tidak pantas
 * @access Private
 */
router.post('/analyze', auth, (req, res) => {
  const { text, imageUrl, childId } = req.body;
  
  if ((!text && !imageUrl) || !childId) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak lengkap'
    });
  }
  
  // Dapatkan pengaturan filter konten untuk anak
  const filters = contentFiltersData.filter(filter => 
    filter.childId === parseInt(childId) && filter.isEnabled
  );
  
  if (filters.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Pengaturan filter konten tidak ditemukan'
    });
  }
  
  // Implementasi AI untuk analisis konten
  // Dalam lingkungan lokal, gunakan mock data
  let analysisResult;
  
  if (config.isLocal) {
    // Mock data untuk lingkungan lokal
    analysisResult = {
      isInappropriate: Math.random() > 0.7, // 30% kemungkinan konten dianggap tidak pantas
      scores: {
        pornografi: Math.random() * 100,
        kekerasan: Math.random() * 100,
        perundungan: Math.random() * 100
      },
      detectedType: Math.random() > 0.7 ? 'pornografi' : (Math.random() > 0.5 ? 'kekerasan' : 'perundungan')
    };
  } else {
    // Implementasi lebih canggih untuk produksi akan menggunakan TensorFlow
    // TensorFlow implementation placeholder
    analysisResult = {
      isInappropriate: false,
      scores: {
        pornografi: 0,
        kekerasan: 0,
        perundungan: 0
      },
      detectedType: null
    };
  }
  
  // Cek apakah konten melanggar batas sensitivitas
  let isBlocked = false;
  let violatedFilter = null;
  
  if (analysisResult.isInappropriate) {
    for (const filter of filters) {
      const score = analysisResult.scores[filter.filterType] || 0;
      if (score >= filter.sensitivity) {
        isBlocked = true;
        violatedFilter = filter.filterType;
        break;
      }
    }
  }
  
  res.json({
    success: true,
    data: {
      isBlocked,
      violatedFilter,
      analysisResult
    }
  });
});

module.exports = router; 