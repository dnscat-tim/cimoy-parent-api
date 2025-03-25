const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../config/environment');

// Path ke file kunci
const KEYS_DIR = path.join(__dirname, '..', '..', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.key');

// Pastikan direktori keys ada
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// Cek apakah public/private keys sudah ada, jika tidak buat yang baru
let privateKey, publicKey;

const generateRSAKeys = () => {
  try {
    console.log('Generating new RSA key pair...');
    // Generate key pair dengan OpenSSL
    const { privateKey: newPrivateKey, publicKey: newPublicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    // Simpan keys ke file
    fs.writeFileSync(PRIVATE_KEY_PATH, newPrivateKey, { mode: 0o600 }); // Pastikan hanya owner yang bisa baca
    fs.writeFileSync(PUBLIC_KEY_PATH, newPublicKey);
    
    console.log('RSA key pair generated and saved successfully');
    
    return {
      privateKey: newPrivateKey,
      publicKey: newPublicKey
    };
  } catch (error) {
    console.error('Error generating RSA keys:', error.message);
    // Fallback ke HMAC jika gagal generate RSA keys
    console.log('Falling back to HMAC secret for JWT');
    
    const hmacSecret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(PRIVATE_KEY_PATH, hmacSecret, { mode: 0o600 });
    
    return {
      privateKey: hmacSecret,
      publicKey: null,
      isHMAC: true
    };
  }
};

try {
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    console.log('Loaded existing RSA keys');
  } else {
    const keys = generateRSAKeys();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
    
    if (keys.isHMAC) {
      // Jika menggunakan HMAC, set publicKey sama dengan privateKey
      publicKey = privateKey;
    }
  }
} catch (error) {
  console.error('Error loading RSA keys:', error.message);
  process.exit(1); // Exit jika gagal load keys
}

// Cek apakah kita menggunakan RSA atau HMAC
const isRSA = privateKey.includes('-----BEGIN PRIVATE KEY-----');

// Token rotation scheduler
let lastKeyRotation = Date.now();
const KEY_ROTATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 jam

// Buat token dengan JWT
const generateToken = (payload, expiresIn = '24h', useFingerprint = true) => {
  // Tambahkan fingerprint ke token untuk mencegah token theft
  let tokenPayload = { ...payload };
  
  if (useFingerprint && payload.deviceId) {
    const fingerprint = generateDeviceFingerprint(payload.deviceId, payload.userId);
    tokenPayload = {
      ...tokenPayload,
      fingerprint
    };
  }
  
  // Untuk implementasi non-local, tambahkan aud, iss, dll
  if (!config.isLocal) {
    tokenPayload = {
      ...tokenPayload,
      iss: 'tracas-api',
      aud: 'tracas-app',
      iat: Math.floor(Date.now() / 1000)
    };
  }
  
  // Cek apakah perlu rotasi kunci
  rotateKeysIfNeeded();
  
  // Generate token
  const options = {
    expiresIn,
    algorithm: isRSA ? 'RS256' : 'HS256'
  };
  
  return jwt.sign(tokenPayload, privateKey, options);
};

// Verifikasi token JWT
const verifyToken = (token) => {
  try {
    const options = {
      algorithms: isRSA ? ['RS256'] : ['HS256'],
    };
    
    if (!config.isLocal) {
      options.issuer = 'tracas-api';
      options.audience = 'tracas-app';
    }
    
    const decoded = jwt.verify(token, isRSA ? publicKey : privateKey, options);
    
    // Jika tidak ada fingerprint atau deviceId, token mungkin dibuat sebelum fitur ini
    if (!decoded.fingerprint || !decoded.deviceId) {
      return decoded;
    }
    
    // Verifikasi fingerprint
    const expectedFingerprint = generateDeviceFingerprint(decoded.deviceId, decoded.userId);
    
    if (decoded.fingerprint !== expectedFingerprint) {
      throw new Error('Invalid token fingerprint');
    }
    
    return decoded;
  } catch (error) {
    throw error;
  }
};

// Rotasi kunci jika sudah melewati interval
const rotateKeysIfNeeded = () => {
  const now = Date.now();
  
  // Hanya rotasi kunci jika:
  // 1. Kita tidak di lingkungan lokal (di prod)
  // 2. Sudah melewati interval rotasi
  if (!config.isLocal && (now - lastKeyRotation) > KEY_ROTATION_INTERVAL) {
    try {
      console.log('Rotating RSA keys...');
      
      // Generate key pair baru
      const newKeys = generateRSAKeys();
      
      // Update keys in memory
      privateKey = newKeys.privateKey;
      publicKey = newKeys.publicKey;
      lastKeyRotation = now;
      
      console.log('RSA keys rotated successfully');
    } catch (error) {
      console.error('Error rotating RSA keys:', error.message);
    }
  }
};

// Generate fingerprint dari deviceId + userId + secret
const generateDeviceFingerprint = (deviceId, userId) => {
  const data = `${deviceId}:${userId}:${config.JWT_SECRET || 'fallback-secret'}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Generate tokens for refresh token flow
const generateTokenPair = (payload) => {
  const accessToken = generateToken(payload, '1h', true);
  const refreshToken = generateToken({ ...payload, type: 'refresh' }, '7d', true);
  
  return {
    accessToken,
    refreshToken
  };
};

// Refresh token (verifikasi refresh token dan buat token baru)
const refreshTokens = (refreshToken) => {
  try {
    const decoded = verifyToken(refreshToken);
    
    // Pastikan token adalah refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    // Hapus type dari payload untuk token baru
    const { type, exp, iat, ...restPayload } = decoded;
    
    // Generate token baru
    return generateTokenPair(restPayload);
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  generateTokenPair,
  refreshTokens,
  rotateKeysIfNeeded
}; 