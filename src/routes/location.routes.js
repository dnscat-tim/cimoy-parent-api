const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');

// Data zona aman untuk testing
const safeZonesData = [
  {
    id: 1,
    childId: 1,
    name: 'Rumah',
    latitude: -6.1754,
    longitude: 106.8272,
    radius: 500 // meter
  },
  {
    id: 2,
    childId: 1,
    name: 'Sekolah',
    latitude: -6.1854,
    longitude: 106.8372,
    radius: 300 // meter
  },
  {
    id: 3,
    childId: 2,
    name: 'Rumah',
    latitude: -6.1954,
    longitude: 106.8472,
    radius: 500 // meter
  }
];

// Data riwayat lokasi untuk testing
const locationHistoryData = [
  {
    id: 1,
    childId: 1,
    latitude: -6.1754,
    longitude: 106.8272,
    accuracy: 10.5,
    timestamp: '2025-03-25T10:30:00Z'
  },
  {
    id: 2,
    childId: 1,
    latitude: -6.1757,
    longitude: 106.8275,
    accuracy: 15.2,
    timestamp: '2025-03-25T10:45:00Z'
  },
  {
    id: 3,
    childId: 1,
    latitude: -6.1760,
    longitude: 106.8280,
    accuracy: 8.7,
    timestamp: '2025-03-25T11:00:00Z'
  }
];

/**
 * @route GET /api/location/safe-zones/:childId
 * @desc Mendapatkan zona aman untuk anak tertentu
 * @access Private
 */
router.get('/safe-zones/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  const safeZones = safeZonesData.filter(zone => zone.childId === childId);
  
  res.json({
    success: true,
    data: safeZones
  });
});

/**
 * @route POST /api/location/safe-zones
 * @desc Menambahkan zona aman baru
 * @access Private (hanya untuk orang tua)
 */
router.post('/safe-zones', auth, (req, res) => {
  // Periksa apakah user adalah orang tua
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang dapat menambahkan zona aman'
    });
  }
  
  const { childId, name, latitude, longitude, radius } = req.body;
  
  if (!childId || !name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak lengkap'
    });
  }
  
  // Validasi data
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Format data tidak valid'
    });
  }
  
  // Tambahkan zona aman baru
  const newSafeZone = {
    id: safeZonesData.length + 1,
    childId: parseInt(childId),
    name,
    latitude,
    longitude,
    radius: radius || 500 // Default radius 500 meter
  };
  
  safeZonesData.push(newSafeZone);
  
  res.status(201).json({
    success: true,
    message: 'Zona aman berhasil ditambahkan',
    data: newSafeZone
  });
});

/**
 * @route PUT /api/location/safe-zones/:id
 * @desc Memperbarui zona aman
 * @access Private (hanya untuk orang tua)
 */
router.put('/safe-zones/:id', auth, (req, res) => {
  // Periksa apakah user adalah orang tua
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang dapat memperbarui zona aman'
    });
  }
  
  const zoneId = parseInt(req.params.id);
  const zoneIndex = safeZonesData.findIndex(zone => zone.id === zoneId);
  
  if (zoneIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Zona aman tidak ditemukan'
    });
  }
  
  const { name, latitude, longitude, radius } = req.body;
  
  // Update zona aman
  if (name) safeZonesData[zoneIndex].name = name;
  if (latitude !== undefined) safeZonesData[zoneIndex].latitude = latitude;
  if (longitude !== undefined) safeZonesData[zoneIndex].longitude = longitude;
  if (radius) safeZonesData[zoneIndex].radius = radius;
  
  res.json({
    success: true,
    message: 'Zona aman berhasil diperbarui',
    data: safeZonesData[zoneIndex]
  });
});

/**
 * @route DELETE /api/location/safe-zones/:id
 * @desc Menghapus zona aman
 * @access Private (hanya untuk orang tua)
 */
router.delete('/safe-zones/:id', auth, (req, res) => {
  // Periksa apakah user adalah orang tua
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang dapat menghapus zona aman'
    });
  }
  
  const zoneId = parseInt(req.params.id);
  const zoneIndex = safeZonesData.findIndex(zone => zone.id === zoneId);
  
  if (zoneIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Zona aman tidak ditemukan'
    });
  }
  
  // Hapus zona aman
  safeZonesData.splice(zoneIndex, 1);
  
  res.json({
    success: true,
    message: 'Zona aman berhasil dihapus'
  });
});

/**
 * @route POST /api/location/update/:childId
 * @desc Menyimpan lokasi terbaru anak
 * @access Private (hanya untuk perangkat anak)
 */
router.post('/update/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  const { latitude, longitude, accuracy } = req.body;
  
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Data lokasi tidak lengkap'
    });
  }
  
  // Validasi data
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Format data tidak valid'
    });
  }
  
  // Simpan lokasi terbaru
  const newLocation = {
    id: locationHistoryData.length + 1,
    childId,
    latitude,
    longitude,
    accuracy: accuracy || null,
    timestamp: new Date().toISOString()
  };
  
  locationHistoryData.push(newLocation);
  
  // Cek apakah lokasi berada di dalam zona aman
  const safeZones = safeZonesData.filter(zone => zone.childId === childId);
  const insideSafeZone = safeZones.find(zone => {
    // Hitung jarak antara lokasi dengan pusat zona aman
    const distance = calculateDistance(
      latitude, 
      longitude, 
      zone.latitude, 
      zone.longitude
    );
    
    // Cek apakah jarak kurang dari radius zona aman
    return distance <= zone.radius;
  });
  
  res.json({
    success: true,
    message: 'Lokasi berhasil diperbarui',
    data: {
      location: newLocation,
      insideSafeZone: insideSafeZone ? true : false,
      safeZoneName: insideSafeZone ? insideSafeZone.name : null
    }
  });
});

/**
 * @route GET /api/location/history/:childId
 * @desc Mendapatkan riwayat lokasi anak
 * @access Private
 */
router.get('/history/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  
  // Dapatkan parameter query untuk filtering
  const { startDate, endDate, limit } = req.query;
  
  // Filter berdasarkan childId
  let filteredHistory = locationHistoryData.filter(loc => loc.childId === childId);
  
  // Filter berdasarkan tanggal jika ada
  if (startDate && endDate) {
    filteredHistory = filteredHistory.filter(loc => {
      const locDate = new Date(loc.timestamp);
      return locDate >= new Date(startDate) && locDate <= new Date(endDate);
    });
  }
  
  // Urutkan berdasarkan timestamp terbaru
  filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Batasi jumlah hasil jika parameter limit ada
  if (limit) {
    filteredHistory = filteredHistory.slice(0, parseInt(limit));
  }
  
  res.json({
    success: true,
    data: filteredHistory
  });
});

/**
 * @route GET /api/location/last/:childId
 * @desc Mendapatkan lokasi terakhir anak
 * @access Private
 */
router.get('/last/:childId', auth, (req, res) => {
  const childId = parseInt(req.params.childId);
  
  // Cari lokasi terbaru berdasarkan timestamp
  const childLocations = locationHistoryData.filter(loc => loc.childId === childId);
  
  if (childLocations.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Lokasi tidak ditemukan'
    });
  }
  
  // Urutkan berdasarkan timestamp terbaru
  childLocations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Ambil lokasi terbaru
  const lastLocation = childLocations[0];
  
  // Cek apakah lokasi berada di dalam zona aman
  const safeZones = safeZonesData.filter(zone => zone.childId === childId);
  const insideSafeZone = safeZones.find(zone => {
    // Hitung jarak antara lokasi dengan pusat zona aman
    const distance = calculateDistance(
      lastLocation.latitude, 
      lastLocation.longitude, 
      zone.latitude, 
      zone.longitude
    );
    
    // Cek apakah jarak kurang dari radius zona aman
    return distance <= zone.radius;
  });
  
  res.json({
    success: true,
    data: {
      location: lastLocation,
      insideSafeZone: insideSafeZone ? true : false,
      safeZoneName: insideSafeZone ? insideSafeZone.name : null
    }
  });
});

/**
 * Fungsi untuk menghitung jarak antara dua titik koordinat (dalam meter)
 * Menggunakan formula Haversine
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Fungsi untuk mengkonversi derajat ke radian
 */
function toRad(degrees) {
  return degrees * Math.PI / 180;
}

module.exports = router; 