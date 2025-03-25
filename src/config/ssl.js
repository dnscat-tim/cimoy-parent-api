const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { config } = require('./environment');

// Path ke file sertifikat SSL
const SSL_DIR = path.join(__dirname, '..', '..', 'ssl');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(SSL_DIR, 'certificate.pem');
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(SSL_DIR, 'private-key.pem');
const SSL_CA_PATH = process.env.SSL_CA_PATH || path.join(SSL_DIR, 'ca-certificate.pem');

/**
 * Konfigurasi SSL untuk HTTPS server
 * @param {Express.Application} app - Express application
 * @param {Function} onServerStart - Callback dipanggil saat server telah dimulai
 * @returns {Object} Server instance
 */
const setupServer = (app, onServerStart) => {
  // Pastikan direktori SSL ada
  if (!fs.existsSync(SSL_DIR)) {
    fs.mkdirSync(SSL_DIR, { recursive: true });
  }

  // Port konfigurasi
  const HTTP_PORT = process.env.HTTP_PORT || 3000;
  const HTTPS_PORT = process.env.HTTPS_PORT || 443;

  let server;

  // Jika semua file SSL ada, buat HTTPS server
  if (config.useSSL && fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
    // Opsi SSL dengan Cipher Suite yang kuat
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
      secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
      ciphers: [
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'DHE-RSA-AES256-GCM-SHA384',
        'DHE-RSA-AES128-GCM-SHA256'
      ].join(':'),
      honorCipherOrder: true
    };

    // Jika CA certificate tersedia, tambahkan ke opsi SSL
    if (fs.existsSync(SSL_CA_PATH)) {
      sslOptions.ca = fs.readFileSync(SSL_CA_PATH);
    }

    // Buat HTTPS server
    server = https.createServer(sslOptions, app);

    // Mulai HTTPS server
    server.listen(HTTPS_PORT, () => {
      console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
      
      // Mulai HTTP server untuk redirects ke HTTPS
      const httpApp = require('express')();
      httpApp.all('*', (req, res) => {
        // Redirect semua HTTP ke HTTPS
        const host = req.headers.host?.split(':')[0] || 'localhost';
        res.redirect(301, `https://${host}${HTTPS_PORT !== 443 ? `:${HTTPS_PORT}` : ''}${req.url}`);
      });

      http.createServer(httpApp).listen(HTTP_PORT, () => {
        console.log(`ℹ️ HTTP Server (redirecting to HTTPS) running on port ${HTTP_PORT}`);
        
        // Panggil callback jika tersedia
        if (typeof onServerStart === 'function') {
          onServerStart(server);
        }
      });
    });

    console.log(`
    🔒 TLS/SSL Enabled:
    - TLS 1.2 and 1.3 only
    - Strong cipher suites
    - Certificate: ${SSL_CERT_PATH}
    - All HTTP traffic will be redirected to HTTPS
    `);
  } else {
    // Jika SSL tidak diaktifkan, gunakan HTTP server biasa
    server = http.createServer(app);
    server.listen(HTTP_PORT, () => {
      if (config.useSSL) {
        console.warn(`⚠️ SSL diaktifkan tapi sertifikat tidak ditemukan. Menggunakan HTTP sebagai fallback.`);
      }
      console.log(`ℹ️ HTTP Server running on port ${HTTP_PORT}`);
      
      // Panggil callback jika tersedia
      if (typeof onServerStart === 'function') {
        onServerStart(server);
      }
    });
  }

  return server;
};

/**
 * Tambahkan HSTS middleware
 * @param {Object} options - Opsi HSTS
 * @returns {Function} Middleware Express
 */
const hstsMiddleware = (options = {}) => {
  const defaultOptions = {
    maxAge: 15552000, // 180 hari dalam detik
    includeSubDomains: true,
    preload: true
  };

  const hstsOptions = { ...defaultOptions, ...options };

  return (req, res, next) => {
    // Hanya terapkan HSTS jika koneksi aman (HTTPS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader(
        'Strict-Transport-Security',
        `max-age=${hstsOptions.maxAge}${hstsOptions.includeSubDomains ? '; includeSubDomains' : ''}${hstsOptions.preload ? '; preload' : ''}`
      );
    }
    next();
  };
};

/**
 * Konfigurasi otomatis Let's Encrypt
 * @param {string} domain - Domain untuk sertifikat
 * @param {string} email - Email untuk notifikasi Let's Encrypt
 * @returns {Promise<void>}
 */
const setupLetsEncrypt = async (domain, email) => {
  try {
    const greenlock = require('greenlock');

    // Konfigurasi Greenlock untuk Let's Encrypt
    const gl = greenlock.create({
      packageRoot: path.join(__dirname, '..', '..'),
      configDir: path.join(__dirname, '..', '..', 'greenlock.d'),
      maintainerEmail: email,
    });

    // Setup site dengan domain
    await gl.add({
      subject: domain,
      altnames: [domain],
    });

    console.log(`🔒 Let's Encrypt configured for domain: ${domain}`);
  } catch (error) {
    console.error('Error setting up Let\'s Encrypt:', error.message);
  }
};

/**
 * Audit konfigurasi SSL
 * @returns {Object} Hasil audit
 */
const auditSSLConfig = () => {
  const sslConfig = {
    enabled: config.useSSL,
    certificatePath: SSL_CERT_PATH,
    keyPath: SSL_KEY_PATH,
    caPath: SSL_CA_PATH,
    cipherSuites: [
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305'
    ],
    minVersion: 'TLSv1.2',
    disabledVersions: ['SSLv3', 'TLSv1.0', 'TLSv1.1'],
    hstsEnabled: true,
    certificateValid: false,
    daysToExpiration: 0
  };

  // Periksa keberadaan dan validitas sertifikat
  if (fs.existsSync(SSL_CERT_PATH)) {
    try {
      const cert = fs.readFileSync(SSL_CERT_PATH);
      const certDetails = require('crypto').createX509Certificate(cert);
      
      // Periksa expired date
      const notAfter = new Date(certDetails.validTo);
      const now = new Date();
      sslConfig.certificateValid = notAfter > now;
      sslConfig.daysToExpiration = Math.floor((notAfter - now) / (1000 * 60 * 60 * 24));
      
      // Periksa detail sertifikat
      sslConfig.certificateIssuer = certDetails.issuer;
      sslConfig.certificateSubject = certDetails.subject;
    } catch (error) {
      console.error('Error reading certificate:', error.message);
    }
  }

  return sslConfig;
};

module.exports = {
  setupServer,
  hstsMiddleware,
  setupLetsEncrypt,
  auditSSLConfig
}; 