const { body, param, query, validationResult } = require('express-validator');
const { config } = require('../config/environment');

// Custom validator untuk UUID
const isUUID = (value) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

// Custom validator untuk password kuat
const isStrongPassword = (value) => {
  // Minimal 12 karakter, harus memiliki huruf kecil, huruf besar, angka, dan karakter khusus
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;
  return strongPasswordRegex.test(value);
};

// Custom validator untuk XSS
const containsXSS = (value) => {
  if (typeof value !== 'string') return false;
  
  // Blacklist pola XSS yang umum
  const xssPatterns = [
    /<script\b[^>]*>(.*?)<\/script>/gi,
    /javascript:/gi,
    /onerror=/gi,
    /onload=/gi,
    /onclick=/gi,
    /onmouseover=/gi,
    /eval\(/gi,
    /document\.cookie/gi
  ];
  
  return xssPatterns.some(pattern => pattern.test(value));
};

// Custom validator untuk SQL Injection
const containsSQLi = (value) => {
  if (typeof value !== 'string') return false;
  
  // Blacklist pola SQL Injection yang umum
  const sqliPatterns = [
    /'\s*OR\s*'1'\s*=\s*'1/gi,
    /'\s*OR\s*1\s*=\s*1/gi,
    /'\s*;\s*DROP\s+TABLE/gi,
    /'\s*;\s*DELETE\s+FROM/gi,
    /'\s*UNION\s+SELECT/gi,
    /'\s*;\s*INSERT\s+INTO/gi,
    /'\s*;\s*UPDATE\s+.*\s+SET/gi
  ];
  
  return sqliPatterns.some(pattern => pattern.test(value));
};

// Bundle validasi parent API
const validateParentAPI = [
  // Validasi umum
  body('email').isEmail().normalizeEmail()
    .withMessage('Email tidak valid'),
  
  body('password').custom(isStrongPassword)
    .withMessage('Password harus minimal 12 karakter, mengandung huruf kecil, huruf besar, angka, dan karakter khusus'),
  
  body('childId').custom(isUUID)
    .withMessage('Child ID harus berupa UUID yang valid'),
  
  // Validasi khusus untuk XSS dan SQLi
  body('*.name').not().isEmpty()
    .withMessage('Nama tidak boleh kosong')
    .isLength({ min: 2, max: 50 })
    .withMessage('Nama harus 2-50 karakter')
    .custom(value => !containsXSS(value))
    .withMessage('Input mengandung kode berbahaya (XSS)'),
  
  body('*.description').optional()
    .isLength({ max: 500 })
    .withMessage('Deskripsi maksimal 500 karakter')
    .custom(value => !containsXSS(value))
    .withMessage('Input mengandung kode berbahaya (XSS)')
    .custom(value => !containsSQLi(value))
    .withMessage('Input mengandung kode berbahaya (SQLi)'),
  
  // Pemfilteran JSON
  body('*.').custom((value, { req }) => {
    // Cek apakah ada properti dengan nama mencurigakan
    const suspiciousProps = ['__proto__', 'constructor', 'prototype'];
    const hasPrototypePollution = Object.keys(req.body)
      .some(key => suspiciousProps.includes(key));
    
    if (hasPrototypePollution) {
      throw new Error('JSON tidak valid - prototype pollution terdeteksi');
    }
    
    return true;
  })
];

// Bundle validasi child API
const validateChildAPI = [
  // Validasi umum untuk API anak
  body('deviceId').not().isEmpty()
    .withMessage('Device ID tidak boleh kosong')
    .isLength({ min: 10, max: 100 })
    .withMessage('Device ID harus 10-100 karakter'),
  
  body('location.latitude').optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude harus berupa angka antara -90 dan 90'),
  
  body('location.longitude').optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude harus berupa angka antara -180 dan 180'),
  
  // Validasi untuk mencegah RCE
  body('*.command').not().exists()
    .withMessage('Parameter command tidak diizinkan'),
  
  body('*.exec').not().exists()
    .withMessage('Parameter exec tidak diizinkan'),
  
  body('*.code').not().exists()
    .withMessage('Parameter code tidak diizinkan')
];

// Validasi header untuk mencegah CSRF
const validateHeaders = (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  
  const allowedOrigins = config.isLocal 
    ? ['http://localhost:3000', 'http://localhost:5173'] 
    : ['https://tracas.id', 'https://app.tracas.id'];
  
  const isValidOrigin = allowedOrigins.some(allowed => 
    origin.startsWith(allowed) || referer.startsWith(allowed)
  );
  
  if (!isValidOrigin && !config.isLocal) {
    return res.status(403).json({
      success: false,
      message: 'Invalid origin',
      error: 'CSRF protection'
    });
  }
  
  next();
};

// Middleware untuk memeriksa hasil validasi
const checkValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Log validasi gagal
    console.warn(`Validation failed: ${req.method} ${req.path}`, {
      errors: errors.array(),
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(422).json({
      success: false,
      message: 'Data validasi tidak valid',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  
  next();
};

// Middleware untuk pemfilteran geolokasi (country blocking)
const validateGeoLocation = (allowedCountries = ['ID', 'SG', 'MY']) => {
  return (req, res, next) => {
    // Hanya aktif di production
    if (config.isLocal) return next();
    
    // Ideally, we'd use a geo-IP database here like MaxMind
    // This is a placeholder implementation
    const clientIP = req.ip || req.connection.remoteAddress;
    const countryCode = req.headers['cf-ipcountry'] || 'XX'; // Cloudflare header
    
    if (!allowedCountries.includes(countryCode)) {
      console.warn(`Access blocked from non-allowed country: ${countryCode}`, {
        ip: clientIP,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied from your region',
        error: 'GEOBLOCKING_RESTRICTION'
      });
    }
    
    next();
  };
};

module.exports = {
  validateParentAPI,
  validateChildAPI,
  validateHeaders,
  checkValidationErrors,
  validateGeoLocation,
  // Ekspose validator lain agar dapat digunakan secara modular
  isUUID,
  isStrongPassword,
  containsXSS,
  containsSQLi
}; 