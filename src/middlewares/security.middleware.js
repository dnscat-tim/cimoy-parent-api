const helmet = require('helmet');
const crypto = require('crypto');
const { config } = require('../config/environment');

/**
 * Konfigurasi helmet untuk meningkatkan keamanan HTTP header
 * termasuk Content-Security-Policy, XSS Protection, dll.
 */
const securityHeaders = () => {
  // Generate nonce yang unik untuk setiap request
  return (req, res, next) => {
    // Buat nonce untuk CSP
    req.cspNonce = crypto.randomBytes(16).toString('base64');
    
    // Konfigurasi default helmet
    const helmetConfig = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", `'nonce-${req.cspNonce}'`],
          styleSrc: ["'self'", `'nonce-${req.cspNonce}'`, "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: { policy: "require-corp" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: "deny" },
      hsts: {
        maxAge: 15552000, // 180 hari
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xssFilter: true,
    };
    
    // Sesuaikan CSP untuk development mode
    if (config.isLocal || process.env.NODE_ENV === 'development') {
      helmetConfig.contentSecurityPolicy.directives.connectSrc = ["'self'", "ws:", "wss:"];
      helmetConfig.contentSecurityPolicy.directives.scriptSrc.push("'unsafe-eval'"); // Untuk hot reload
      
      // Disable beberapa fitur yang bisa mengganggu development
      delete helmetConfig.contentSecurityPolicy;
      delete helmetConfig.crossOriginEmbedderPolicy;
      delete helmetConfig.crossOriginOpenerPolicy;
      delete helmetConfig.crossOriginResourcePolicy;
    }
    
    // Gunakan helmet dengan konfigurasi
    helmet(helmetConfig)(req, res, next);
  };
};

/**
 * Middleware untuk nocache agar memastikan data sensitif tidak di-cache
 */
const noCache = () => {
  return (req, res, next) => {
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  };
};

/**
 * Middleware untuk menambahkan HTTP security headers tambahan
 */
const additionalSecurityHeaders = () => {
  return (req, res, next) => {
    // Mencegah clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Mencegah MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Feature Policy
    res.setHeader('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    
    // Menghapus header yang mengungkap informasi tentang server
    res.removeHeader('X-Powered-By');
    
    next();
  };
};

/**
 * Middleware untuk CORS
 */
const corsMiddleware = () => {
  return (req, res, next) => {
    // Definisikan allowed origins berdasarkan environment
    const allowedOrigins = config.isLocal 
      ? ['http://localhost:3000', 'http://localhost:8080'] 
      : ['https://app.tracas-studio.com'];
    
    const requestOrigin = req.headers.origin;
    
    // Periksa apakah origin yang merequest diizinkan
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 jam
    }
    
    // Tangani OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    next();
  };
};

module.exports = {
  securityHeaders,
  noCache,
  additionalSecurityHeaders,
  corsMiddleware
}; 