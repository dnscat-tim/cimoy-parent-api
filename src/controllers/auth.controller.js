const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/setup');
const config = require('../config/config');

/**
 * Mendaftarkan pengguna baru (orang tua)
 */
exports.register = (req, res) => {
  const { email, password, full_name } = req.body;
  
  // Validasi input
  if (!email || !password || !full_name) {
    return res.status(400).json({
      message: 'Email, password, dan nama lengkap wajib diisi'
    });
  }
  
  // Periksa apakah email sudah terdaftar
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: 'Kesalahan database',
        error: config.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (row) {
      return res.status(400).json({
        message: 'Email sudah terdaftar'
      });
    }
    
    // Hash password
    bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS, (err, hashedPassword) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan saat mengenkripsi password',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      // Simpan user baru
      db.run(
        'INSERT INTO users (email, password, full_name) VALUES (?, ?, ?)',
        [email, hashedPassword, full_name],
        function(err) {
          if (err) {
            return res.status(500).json({
              message: 'Kesalahan saat mendaftarkan pengguna',
              error: config.NODE_ENV === 'development' ? err.message : undefined
            });
          }
          
          // Buat token JWT
          const token = jwt.sign(
            { id: this.lastID },
            config.JWT_SECRET,
            { expiresIn: config.JWT_EXPIRES_IN }
          );
          
          res.status(201).json({
            message: 'Pendaftaran berhasil',
            token,
            user: {
              id: this.lastID,
              email,
              full_name
            }
          });
        }
      );
    });
  });
};

/**
 * Login untuk pengguna yang terdaftar
 */
exports.login = (req, res) => {
  const { email, password } = req.body;
  
  // Validasi input
  if (!email || !password) {
    return res.status(400).json({
      message: 'Email dan password wajib diisi'
    });
  }
  
  // Cari user berdasarkan email
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({
        message: 'Kesalahan database',
        error: config.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (!user) {
      return res.status(401).json({
        message: 'Email atau password salah'
      });
    }
    
    // Periksa password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan saat memverifikasi password',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      if (!isMatch) {
        return res.status(401).json({
          message: 'Email atau password salah'
        });
      }
      
      // Buat token JWT
      const token = jwt.sign(
        { id: user.id },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRES_IN }
      );
      
      res.json({
        message: 'Login berhasil',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        }
      });
    });
  });
};

/**
 * Mendapatkan data profil pengguna
 */
exports.getProfile = (req, res) => {
  db.get('SELECT id, email, full_name, created_at FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err) {
      return res.status(500).json({
        message: 'Kesalahan database',
        error: config.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (!user) {
      return res.status(404).json({
        message: 'Pengguna tidak ditemukan'
      });
    }
    
    res.json({
      user
    });
  });
};

/**
 * Mengubah password pengguna
 */
exports.changePassword = (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Validasi input
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: 'Password saat ini dan password baru wajib diisi'
    });
  }
  
  // Dapatkan user
  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err) {
      return res.status(500).json({
        message: 'Kesalahan database',
        error: config.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    if (!user) {
      return res.status(404).json({
        message: 'Pengguna tidak ditemukan'
      });
    }
    
    // Verifikasi password saat ini
    bcrypt.compare(currentPassword, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan saat memverifikasi password',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      if (!isMatch) {
        return res.status(401).json({
          message: 'Password saat ini salah'
        });
      }
      
      // Hash password baru
      bcrypt.hash(newPassword, config.BCRYPT_SALT_ROUNDS, (err, hashedPassword) => {
        if (err) {
          return res.status(500).json({
            message: 'Kesalahan saat mengenkripsi password',
            error: config.NODE_ENV === 'development' ? err.message : undefined
          });
        }
        
        // Update password
        db.run(
          'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [hashedPassword, req.userId],
          (err) => {
            if (err) {
              return res.status(500).json({
                message: 'Kesalahan saat mengubah password',
                error: config.NODE_ENV === 'development' ? err.message : undefined
              });
            }
            
            res.json({
              message: 'Password berhasil diubah'
            });
          }
        );
      });
    });
  });
}; 