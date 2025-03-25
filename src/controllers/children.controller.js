const db = require('../db/setup');
const config = require('../config/config');

/**
 * Mendapatkan semua anak dari orang tua yang terautentikasi
 */
exports.getChildren = (req, res) => {
  db.all(
    'SELECT * FROM children WHERE user_id = ?',
    [req.userId],
    (err, children) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan database saat mengambil data anak',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      res.json({ children });
    }
  );
};

/**
 * Mendapatkan data satu anak berdasarkan ID
 */
exports.getChild = (req, res) => {
  // Data anak sudah ada di req.child dari middleware verifyChildOwnership
  return res.json({ child: req.child });
};

/**
 * Menambahkan anak baru
 */
exports.addChild = (req, res) => {
  const { name, birth_date, device_id, max_screen_time } = req.body;
  
  // Validasi input
  if (!name) {
    return res.status(400).json({
      message: 'Nama anak wajib diisi'
    });
  }

  // Gunakan default screen time jika tidak disebutkan
  const screenTime = max_screen_time || config.MAX_DEFAULT_SCREEN_TIME;
  
  // Periksa apakah device_id sudah terdaftar
  if (device_id) {
    db.get('SELECT * FROM children WHERE device_id = ?', [device_id], (err, row) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan database',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      if (row) {
        return res.status(400).json({
          message: 'Device ID sudah terdaftar untuk anak lain'
        });
      }
      
      insertChild();
    });
  } else {
    insertChild();
  }
  
  function insertChild() {
    db.run(
      `INSERT INTO children 
       (user_id, name, birth_date, device_id, max_screen_time) 
       VALUES (?, ?, ?, ?, ?)`,
      [req.userId, name, birth_date, device_id, screenTime],
      function(err) {
        if (err) {
          return res.status(500).json({
            message: 'Kesalahan saat menambahkan anak',
            error: config.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        
        // Ambil data anak yang baru ditambahkan
        db.get('SELECT * FROM children WHERE id = ?', [this.lastID], (err, child) => {
          if (err) {
            return res.status(500).json({
              message: 'Anak berhasil ditambahkan tetapi gagal mengambil data',
              error: config.NODE_ENV === 'development' ? err.message : undefined
            });
          }
          
          // Tambahkan filter konten default untuk anak baru
          addDefaultContentFilters(this.lastID);
          
          res.status(201).json({
            message: 'Anak berhasil ditambahkan',
            child
          });
        });
      }
    );
  }
  
  // Menambahkan filter konten default untuk anak baru
  function addDefaultContentFilters(childId) {
    const filterTypes = ['pornografi', 'kekerasan', 'perundungan'];
    
    filterTypes.forEach(filterType => {
      db.run(
        `INSERT INTO content_filters 
         (child_id, filter_type, is_enabled, sensitivity) 
         VALUES (?, ?, 1, ?)`,
        [childId, filterType, config.CONTENT_FILTER_THRESHOLD]
      );
    });
  }
};

/**
 * Mengupdate data anak
 */
exports.updateChild = (req, res) => {
  const childId = req.params.id;
  const { name, birth_date, device_id, max_screen_time } = req.body;
  
  // Validasi input
  if (!name) {
    return res.status(400).json({
      message: 'Nama anak wajib diisi'
    });
  }
  
  // Periksa apakah device_id sudah terdaftar untuk anak lain
  if (device_id) {
    db.get(
      'SELECT * FROM children WHERE device_id = ? AND id != ?', 
      [device_id, childId],
      (err, row) => {
        if (err) {
          return res.status(500).json({
            message: 'Kesalahan database',
            error: config.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        
        if (row) {
          return res.status(400).json({
            message: 'Device ID sudah terdaftar untuk anak lain'
          });
        }
        
        updateChildData();
      }
    );
  } else {
    updateChildData();
  }
  
  function updateChildData() {
    db.run(
      `UPDATE children SET 
       name = ?, 
       birth_date = ?, 
       device_id = ?, 
       max_screen_time = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [name, birth_date, device_id, max_screen_time, childId, req.userId],
      function(err) {
        if (err) {
          return res.status(500).json({
            message: 'Kesalahan saat mengupdate data anak',
            error: config.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        
        // Periksa apakah ada baris yang terpengaruh
        if (this.changes === 0) {
          return res.status(404).json({
            message: 'Anak tidak ditemukan atau bukan milik Anda'
          });
        }
        
        // Ambil data anak yang telah diupdate
        db.get('SELECT * FROM children WHERE id = ?', [childId], (err, child) => {
          if (err) {
            return res.status(500).json({
              message: 'Data anak berhasil diupdate tetapi gagal mengambil data',
              error: config.NODE_ENV === 'development' ? err.message : undefined
            });
          }
          
          res.json({
            message: 'Data anak berhasil diupdate',
            child
          });
        });
      }
    );
  }
};

/**
 * Menghapus anak beserta semua data terkait
 */
exports.deleteChild = (req, res) => {
  const childId = req.params.id;
  
  db.run(
    'DELETE FROM children WHERE id = ? AND user_id = ?',
    [childId, req.userId],
    function(err) {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan saat menghapus anak',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      // Periksa apakah ada baris yang terpengaruh
      if (this.changes === 0) {
        return res.status(404).json({
          message: 'Anak tidak ditemukan atau bukan milik Anda'
        });
      }
      
      res.json({
        message: 'Anak dan semua data terkait berhasil dihapus'
      });
    }
  );
};

/**
 * Mendaftarkan device untuk anak
 */
exports.registerDevice = (req, res) => {
  const childId = req.params.id;
  const { device_id } = req.body;
  
  // Validasi input
  if (!device_id) {
    return res.status(400).json({
      message: 'Device ID wajib diisi'
    });
  }
  
  // Periksa apakah device_id sudah terdaftar
  db.get('SELECT * FROM children WHERE device_id = ?', [device_id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: 'Kesalahan database',
        error: config.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (row && row.id != childId) {
      return res.status(400).json({
        message: 'Device ID sudah terdaftar untuk anak lain'
      });
    }
    
    // Update device_id anak
    db.run(
      'UPDATE children SET device_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [device_id, childId, req.userId],
      function(err) {
        if (err) {
          return res.status(500).json({
            message: 'Kesalahan saat mendaftarkan device',
            error: config.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        
        // Periksa apakah ada baris yang terpengaruh
        if (this.changes === 0) {
          return res.status(404).json({
            message: 'Anak tidak ditemukan atau bukan milik Anda'
          });
        }
        
        res.json({
          message: 'Device berhasil didaftarkan untuk anak'
        });
      }
    );
  });
};

/**
 * Mengatur batas waktu penggunaan layar untuk anak
 */
exports.setScreenTimeLimit = (req, res) => {
  const childId = req.params.id;
  const { max_screen_time } = req.body;
  
  // Validasi input
  if (!max_screen_time || max_screen_time < 0) {
    return res.status(400).json({
      message: 'Batas waktu penggunaan layar tidak valid'
    });
  }
  
  db.run(
    'UPDATE children SET max_screen_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [max_screen_time, childId, req.userId],
    function(err) {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan saat mengatur batas waktu',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      // Periksa apakah ada baris yang terpengaruh
      if (this.changes === 0) {
        return res.status(404).json({
          message: 'Anak tidak ditemukan atau bukan milik Anda'
        });
      }
      
      res.json({
        message: 'Batas waktu penggunaan layar berhasil diatur',
        max_screen_time
      });
    }
  );
}; 