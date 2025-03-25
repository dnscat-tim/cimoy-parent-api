const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../db/setup');
const { verifyToken } = require('../security/jwt');
const logger = require('../utils/logger');

/**
 * Middleware untuk memverifikasi token autentikasi
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
module.exports = (req, res, next) => {
  try {
    // Dapatkan token dari header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token tidak tersedia.'
      });
    }
    
    // Ekstrak token dari header
    const token = authHeader.split(' ')[1];
    
    // Verifikasi token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Simpan data user ke request
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Sesi telah berakhir. Silakan login kembali.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid.'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Akses ditolak.'
    });
  }
};

/**
 * Middleware untuk memeriksa apakah anak milik orang tua yang terautentikasi
 * Harus digunakan setelah verifyToken
 */
exports.verifyChildOwnership = (req, res, next) => {
  const childId = req.params.id || req.body.childId;
  
  if (!childId) {
    return res.status(400).json({
      message: 'ID anak tidak diberikan'
    });
  }
  
  // Periksa kepemilikan anak
  db.get(
    'SELECT * FROM children WHERE id = ? AND user_id = ?',
    [childId, req.userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan database saat memeriksa kepemilikan anak',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      if (!row) {
        return res.status(403).json({
          message: 'Anda tidak memiliki akses ke data anak ini'
        });
      }
      
      // Tambahkan data anak ke request
      req.child = row;
      next();
    }
  );
};

/**
 * Middleware untuk memeriksa apakah device adalah milik anak yang terdaftar
 * Digunakan untuk autentikasi dari device anak
 */
exports.verifyChildDevice = (req, res, next) => {
  const deviceId = req.headers['x-device-id'];
  
  if (!deviceId) {
    return res.status(401).json({
      message: 'Device ID tidak diberikan'
    });
  }
  
  // Periksa apakah device terdaftar
  db.get(
    'SELECT * FROM children WHERE device_id = ?',
    [deviceId],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          message: 'Kesalahan database saat memeriksa device',
          error: config.NODE_ENV === 'development' ? err.message : undefined
        });
      }
      
      if (!row) {
        return res.status(401).json({
          message: 'Device tidak terdaftar atau tidak valid'
        });
      }
      
      // Tambahkan data anak ke request
      req.child = row;
      req.childId = row.id;
      next();
    }
  );
};

/**
 * Middleware untuk otentikasi JWT
 * @param {Object} options - Opsi konfigurasi
 * @param {boolean} options.required - Apakah autentikasi wajib
 * @param {string[]} options.roles - Role yang diizinkan akses
 */
const authJWT = (options = { required: true, roles: [] }) => {
  return (req, res, next) => {
    // Ambil token dari header atau cookies
    const token = getTokenFromRequest(req);
    
    // Jika token tidak ada tapi wajib, kirim error
    if (!token && options.required) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token tidak ditemukan.'
      });
    }
    
    // Jika token tidak ada tapi tidak wajib, lanjut
    if (!token && !options.required) {
      req.user = null;
      return next();
    }
    
    // Verifikasi token
    try {
      const decoded = verifyToken(token);
      
      // Periksa apakah user memiliki role yang sesuai
      if (options.roles && options.roles.length > 0) {
        if (!decoded.role || !options.roles.includes(decoded.role)) {
          return res.status(403).json({
            success: false,
            message: 'Akses ditolak. Anda tidak memiliki izin yang cukup.'
          });
        }
      }
      
      // Set user data di request
      req.user = decoded;
      
      // Periksa apakah token akan expired dalam waktu dekat
      checkAndRefreshToken(req, res, decoded);
      
      next();
    } catch (error) {
      // Log error tapi jangan expose detail ke client
      logger.error(`Auth error: ${error.message}`, {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      // Beri response sesuai jenis error
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token telah kedaluwarsa. Silakan login kembali.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (error.message === 'Invalid token fingerprint') {
        return res.status(403).json({
          success: false,
          message: 'Token tidak valid untuk perangkat ini.',
          code: 'INVALID_DEVICE'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid. Silakan login kembali.',
        code: 'INVALID_TOKEN'
      });
    }
  };
};

/**
 * Ambil token dari berbagai lokasi dalam request
 */
const getTokenFromRequest = (req) => {
  // Cek Authorization header (format: "Bearer TOKEN")
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // Cek x-access-token header
  if (req.headers['x-access-token']) {
    return req.headers['x-access-token'];
  }
  
  // Cek cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  // Jika tidak ada token ditemukan
  return null;
};

/**
 * Periksa apakah token akan kedaluwarsa dalam waktu dekat
 * Jika ya, kirim token baru dalam response header
 */
const checkAndRefreshToken = (req, res, decoded) => {
  // Hanya lakukan jika ada expiry
  if (!decoded.exp) return;
  
  const currentTime = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decoded.exp - currentTime;
  
  // Jika token akan expire dalam 10 menit, berikan token baru
  if (timeUntilExpiry < 10 * 60) {
    try {
      const { refreshTokens } = require('../security/jwt');
      
      // Ambil refresh token kalau ada
      const refreshToken = req.cookies.refreshToken || req.headers['x-refresh-token'];
      
      if (refreshToken) {
        const { accessToken, refreshToken: newRefreshToken } = refreshTokens(refreshToken);
        
        // Set token baru di header
        res.setHeader('x-new-token', accessToken);
        res.setHeader('x-new-refresh-token', newRefreshToken);
        
        // Set token baru di cookie jika sebelumnya ada di cookie
        if (req.cookies.token) {
          res.cookie('token', accessToken, {
            httpOnly: true,
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            maxAge: 3600000 // 1 jam
          });
          
          res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            maxAge: 7 * 24 * 3600000 // 7 hari
          });
        }
      }
    } catch (error) {
      // Hanya log error, tapi tetap izinkan request berlanjut
      logger.error(`Token auto-refresh error: ${error.message}`);
    }
  }
};

/**
 * Middleware untuk mengharuskan hak akses sebagai parent
 */
const requireParentRole = (req, res, next) => {
  if (!req.user || req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Hanya orang tua yang diizinkan mengakses rute ini.'
    });
  }
  next();
};

/**
 * Middleware untuk mengharuskan hak akses sebagai admin
 */
const requireAdminRole = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Hanya admin yang diizinkan mengakses rute ini.'
    });
  }
  next();
};

/**
 * Middleware untuk mengharuskan hak akses sebagai device
 */
const requireDeviceRole = (req, res, next) => {
  if (!req.user || req.user.role !== 'device') {
    return res.status(403).json({
      success: false,
      message: 'Hanya perangkat terdaftar yang diizinkan mengakses rute ini.'
    });
  }
  next();
};

module.exports = {
  authJWT,
  requireParentRole,
  requireAdminRole,
  requireDeviceRole
}; 