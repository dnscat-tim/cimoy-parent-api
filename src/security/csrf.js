/**
 * CSRF Protection untuk CIMOY Parent API
 * Menggunakan double submit cookie pattern
 */

const crypto = require('crypto');
const { config } = require('../config/environment');
const { securityLogger } = require('../utils/logger');

// CSRF Secret dari environment atau generate baru
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * Generate CSRF token yang unik
 * @param {Object} req - Express request object
 * @returns {string} CSRF token
 */
function generateCsrfToken(req) {
  const sessionID = req.cookies?.sessionID || crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const userAgent = req.headers['user-agent'] || '';
  
  // Buat token dengan nilai yang unik per pengguna
  const baseString = `${sessionID}:${timestamp}:${userAgent}`;
  const token = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(baseString)
    .digest('hex');
  
  return token;
}

/**
 * Set CSRF token di cookie dan header respons
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function setCsrfToken(req, res, next) {
  // Jika sudah ada token, gunakan yang ada
  if (req.cookies?.csrfToken) {
    res.set('X-CSRF-Token', req.cookies.csrfToken);
    return next();
  }
  
  // Generate token baru
  const token = generateCsrfToken(req);
  
  // Set token sebagai cookie
  res.cookie('csrfToken', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 1 hari
  });
  
  // Juga kirim di header untuk digunakan client
  res.set('X-CSRF-Token', token);
  
  next();
}

/**
 * Verifikasi CSRF token dari request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function verifyCsrfToken(req, res, next) {
  // Skip CSRF check untuk metode yang aman
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];
  
  // Jika tidak ada token
  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing'
    });
  }
  
  // Jika token tidak cocok
  if (cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token invalid'
    });
  }
  
  // Token valid
  next();
}

module.exports = {
  setCsrfToken,
  verifyCsrfToken,
  generateCsrfToken
}; 