const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { securityLogger } = require('../utils/logger');
const { config } = require('../config/environment');

/**
 * Key Manager untuk pengelolaan kunci kriptografi dengan aman
 * Mendukung rotasi kunci, enkripsi/dekripsi, dan hashing
 */
class KeyManager {
  constructor() {
    // Path untuk menyimpan kunci
    this.keysDir = path.join(__dirname, '..', '..', 'keys', 'crypto');
    
    // Default encryption algorithm
    this.encryptionAlgorithm = 'aes-256-gcm'; // Secure, AEAD mode
    
    // Default hash algorithm
    this.hashAlgorithm = 'sha512';
    
    // Default HMAC algorithm
    this.hmacAlgorithm = 'sha256';
    
    // Key rotation interval in days
    this.rotationInterval = 90; // 90 days rotation
    
    // Key info
    this.keys = {
      encryption: null,
      hmac: null,
      pbkdf: null
    };
    
    // Inisialisasi key manager
    this.initialize();
  }
  
  /**
   * Inisialisasi key manager
   */
  initialize() {
    try {
      // Buat direktori jika belum ada
      if (!fs.existsSync(this.keysDir)) {
        fs.mkdirSync(this.keysDir, { recursive: true });
      }
      
      // Load encryption key
      this.loadOrCreateKey('encryption', 32); // 256 bits
      
      // Load HMAC key
      this.loadOrCreateKey('hmac', 64); // 512 bits
      
      // Load PBKDF key (for password hashing)
      this.loadOrCreateKey('pbkdf', 64); // 512 bits
      
      // Setup key rotation
      if (!config.isLocal) {
        // Check for key rotation every 24 hours
        setInterval(() => this.rotateKeysIfNeeded(), 24 * 60 * 60 * 1000);
      }
    } catch (error) {
      securityLogger.error(`Error initializing KeyManager: ${error.message}`, {
        error: error.stack
      });
      throw new Error('Failed to initialize KeyManager');
    }
  }
  
  /**
   * Load existing key or create new one
   * @param {string} keyType - Tipe kunci (encryption, hmac, atau pbkdf)
   * @param {number} keyLength - Panjang kunci dalam bytes
   */
  loadOrCreateKey(keyType, keyLength) {
    const keyPath = path.join(this.keysDir, `${keyType}-key.json`);
    
    try {
      // Cek apakah key file sudah ada
      if (fs.existsSync(keyPath)) {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        this.keys[keyType] = keyData;
        
        // Log
        securityLogger.info(`Loaded ${keyType} key, created on ${new Date(keyData.createdAt).toISOString()}`);
      } else {
        // Buat key baru
        this.generateNewKey(keyType, keyLength);
      }
    } catch (error) {
      securityLogger.error(`Error loading ${keyType} key: ${error.message}`, {
        error: error.stack
      });
      
      // Fallback: buat key baru jika load error
      this.generateNewKey(keyType, keyLength);
    }
  }
  
  /**
   * Generate key baru
   * @param {string} keyType - Tipe kunci
   * @param {number} keyLength - Panjang kunci dalam bytes
   */
  generateNewKey(keyType, keyLength) {
    try {
      // Generate key baru
      const keyValue = crypto.randomBytes(keyLength);
      
      const keyData = {
        id: this.generateKeyId(),
        value: keyValue.toString('hex'),
        createdAt: Date.now(),
        rotatedAt: null,
        algorithm: this.getAlgorithmForKeyType(keyType),
        length: keyLength * 8, // in bits
      };
      
      // Simpan ke memory
      this.keys[keyType] = keyData;
      
      // Simpan ke file (secure permission, hanya owner bisa baca)
      const keyPath = path.join(this.keysDir, `${keyType}-key.json`);
      fs.writeFileSync(keyPath, JSON.stringify(keyData, null, 2), { mode: 0o600 });
      
      // Log
      securityLogger.info(`Generated new ${keyType} key (${keyLength * 8} bits)`);
      
      return keyData;
    } catch (error) {
      securityLogger.error(`Error generating ${keyType} key: ${error.message}`, {
        error: error.stack
      });
      throw new Error(`Failed to generate ${keyType} key`);
    }
  }
  
  /**
   * Dapatkan algoritma yang sesuai untuk tipe kunci
   * @param {string} keyType - Tipe kunci
   * @returns {string} Algoritma
   */
  getAlgorithmForKeyType(keyType) {
    switch (keyType) {
      case 'encryption':
        return this.encryptionAlgorithm;
      case 'hmac':
        return this.hmacAlgorithm;
      case 'pbkdf':
        return 'pbkdf2';
      default:
        return 'unknown';
    }
  }
  
  /**
   * Generate ID untuk key management
   * @returns {string} ID Kunci
   */
  generateKeyId() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  /**
   * Rotasi kunci jika diperlukan
   */
  rotateKeysIfNeeded() {
    for (const keyType in this.keys) {
      if (this.isKeyRotationNeeded(keyType)) {
        securityLogger.info(`Rotating ${keyType} key due to age`);
        
        // Backup kunci lama dengan timestamp
        const oldKey = this.keys[keyType];
        const backupPath = path.join(this.keysDir, `${keyType}-key.${oldKey.id}.backup.json`);
        
        try {
          fs.writeFileSync(backupPath, JSON.stringify(oldKey, null, 2), { mode: 0o600 });
          
          // Generate key baru dengan panjang yang sama
          const keyLength = oldKey.length / 8; // convert bits to bytes
          this.generateNewKey(keyType, keyLength);
          
          // Update rotatedAt pada kunci lama
          oldKey.rotatedAt = Date.now();
          fs.writeFileSync(backupPath, JSON.stringify(oldKey, null, 2), { mode: 0o600 });
          
        } catch (error) {
          securityLogger.error(`Error rotating ${keyType} key: ${error.message}`, {
            error: error.stack
          });
        }
      }
    }
  }
  
  /**
   * Cek apakah kunci perlu dirotasi
   * @param {string} keyType - Tipe kunci
   * @returns {boolean} Apakah perlu dirotasi
   */
  isKeyRotationNeeded(keyType) {
    const key = this.keys[keyType];
    
    if (!key) {
      return false;
    }
    
    const now = Date.now();
    const rotationThresholdMs = this.rotationInterval * 24 * 60 * 60 * 1000;
    const keyAgeMs = now - key.createdAt;
    
    return keyAgeMs > rotationThresholdMs;
  }
  
  /**
   * Enkripsi data dengan AES-GCM
   * @param {string|Buffer} data - Data yang akan dienkripsi
   * @param {Object} associatedData - Data tambahan untuk AEAD authentication
   * @returns {Object} Data terenkripsi dan metadata
   */
  encrypt(data, associatedData = {}) {
    try {
      // Ensure we have an encryption key
      if (!this.keys.encryption) {
        throw new Error('Encryption key not available');
      }
      
      // Get the key value
      const keyBuffer = Buffer.from(this.keys.encryption.value, 'hex');
      
      // Generate a random initialization vector
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.encryptionAlgorithm, keyBuffer, iv);
      
      // Add associated data if using AEAD mode
      if (associatedData && Object.keys(associatedData).length > 0) {
        const aad = Buffer.from(JSON.stringify(associatedData));
        cipher.setAAD(aad);
      }
      
      // Encrypt the data
      let dataBuffer = data;
      if (typeof data === 'string') {
        dataBuffer = Buffer.from(data, 'utf8');
      }
      
      let encrypted = cipher.update(dataBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get the auth tag
      const authTag = cipher.getAuthTag();
      
      // Return encrypted data with metadata
      return {
        data: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyId: this.keys.encryption.id,
        algorithm: this.encryptionAlgorithm,
        hasAssociatedData: !!associatedData
      };
    } catch (error) {
      securityLogger.error(`Encryption error: ${error.message}`, {
        error: error.stack
      });
      throw new Error('Encryption failed');
    }
  }
  
  /**
   * Dekripsi data yang sudah dienkripsi
   * @param {Object} encryptedData - Data terenkripsi dan metadata
   * @param {Object} associatedData - Data tambahan untuk AEAD authentication
   * @returns {Buffer} Data terdekripsi
   */
  decrypt(encryptedData, associatedData = {}) {
    try {
      const { data, iv, authTag, algorithm } = encryptedData;
      
      // Ensure algorithm matches
      if (algorithm !== this.encryptionAlgorithm) {
        throw new Error('Algorithm mismatch');
      }
      
      // Get the key value
      const keyBuffer = Buffer.from(this.keys.encryption.value, 'hex');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(
        algorithm,
        keyBuffer,
        Buffer.from(iv, 'base64')
      );
      
      // Set auth tag for AEAD modes
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      
      // Add associated data if using AEAD mode
      if (associatedData && Object.keys(associatedData).length > 0) {
        const aad = Buffer.from(JSON.stringify(associatedData));
        decipher.setAAD(aad);
      }
      
      // Decrypt the data
      let decrypted = decipher.update(Buffer.from(data, 'base64'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
    } catch (error) {
      securityLogger.error(`Decryption error: ${error.message}`, {
        error: error.stack
      });
      throw new Error('Decryption failed, data may be tampered with or key is invalid');
    }
  }
  
  /**
   * Hash data dengan algoritma yang aman
   * @param {string|Buffer} data - Data yang akan di-hash
   * @param {string} salt - Salt value (optional)
   * @returns {string} Hash result (hex format)
   */
  hash(data, salt = null) {
    try {
      const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      let hashValue;
      
      if (salt) {
        // If salt provided, use it
        const saltBuffer = typeof salt === 'string' ? Buffer.from(salt, 'hex') : salt;
        const hmac = crypto.createHmac(this.hashAlgorithm, saltBuffer);
        hmac.update(dataBuffer);
        hashValue = hmac.digest('hex');
      } else {
        // Otherwise use standard hash
        const hash = crypto.createHash(this.hashAlgorithm);
        hash.update(dataBuffer);
        hashValue = hash.digest('hex');
      }
      
      return hashValue;
    } catch (error) {
      securityLogger.error(`Hashing error: ${error.message}`, {
        error: error.stack
      });
      throw new Error('Hashing failed');
    }
  }
  
  /**
   * Generate HMAC untuk data
   * @param {string|Buffer} data - Data untuk HMAC
   * @returns {string} HMAC result (hex format)
   */
  hmac(data) {
    try {
      // Get the key value
      const keyBuffer = Buffer.from(this.keys.hmac.value, 'hex');
      
      // Create HMAC
      const hmac = crypto.createHmac(this.hmacAlgorithm, keyBuffer);
      
      // Generate HMAC
      const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      hmac.update(dataBuffer);
      
      return hmac.digest('hex');
    } catch (error) {
      securityLogger.error(`HMAC error: ${error.message}`, {
        error: error.stack
      });
      throw new Error('HMAC generation failed');
    }
  }
  
  /**
   * Generate secure hash untuk password dengan PBKDF2
   * @param {string} password - Password yang akan di-hash
   * @returns {Object} Hash result dengan salt dan info
   */
  hashPassword(password) {
    try {
      // Generate random salt
      const salt = crypto.randomBytes(16);
      
      // PBKDF2 parameters
      const iterations = 100000; // High iteration count for security
      const keyLength = 64; // 512 bits
      const digest = 'sha512';
      
      // Hash the password
      const hash = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        keyLength,
        digest
      );
      
      // Return the hash result
      return {
        hash: hash.toString('hex'),
        salt: salt.toString('hex'),
        iterations,
        keyLength,
        digest
      };
    } catch (error) {
      securityLogger.error(`Password hashing error: ${error.message}`, {
        error: error.stack
      });
      throw new Error('Password hashing failed');
    }
  }
  
  /**
   * Verifikasi password dengan hash yang tersimpan
   * @param {string} password - Password yang akan diverifikasi
   * @param {Object} hashData - Data hash password tersimpan
   * @returns {boolean} Apakah password valid
   */
  verifyPassword(password, hashData) {
    try {
      const { hash, salt, iterations, keyLength, digest } = hashData;
      
      // Hash the input password with the same parameters
      const calculatedHash = crypto.pbkdf2Sync(
        password,
        Buffer.from(salt, 'hex'),
        iterations,
        keyLength,
        digest
      ).toString('hex');
      
      // Compare the hashes using constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(calculatedHash, 'hex'),
        Buffer.from(hash, 'hex')
      );
    } catch (error) {
      securityLogger.error(`Password verification error: ${error.message}`, {
        error: error.stack
      });
      return false;
    }
  }
  
  /**
   * Generate token untuk keamanan (CSRF, API key, dll)
   * @param {number} length - Panjang token dalam bytes
   * @returns {string} Token (hex format)
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * Generate nonce untuk komunikasi aman
   * @param {number} length - Panjang nonce dalam bytes
   * @returns {string} Nonce (base64 format)
   */
  generateNonce(length = 16) {
    return crypto.randomBytes(length).toString('base64');
  }
}

// Singleton instance
let keyManagerInstance = null;

/**
 * Get KeyManager instance (singleton)
 * @returns {KeyManager} Key manager instance
 */
const getKeyManager = () => {
  if (!keyManagerInstance) {
    keyManagerInstance = new KeyManager();
  }
  return keyManagerInstance;
};

/**
 * Enkripsi nilai sensitif
 * @param {string|Buffer} value - Nilai yang akan dienkripsi
 * @param {Object} context - Konteks untuk AEAD
 * @returns {string} Nilai terenkripsi (JSON string format)
 */
const encryptValue = (value, context = {}) => {
  const keyManager = getKeyManager();
  const encrypted = keyManager.encrypt(value, context);
  return JSON.stringify(encrypted);
};

/**
 * Dekripsi nilai terenkripsi
 * @param {string} encryptedValue - Nilai terenkripsi (JSON string format)
 * @param {Object} context - Konteks untuk AEAD (harus sama dengan saat enkripsi)
 * @returns {string} Nilai terdekripsi
 */
const decryptValue = (encryptedValue, context = {}) => {
  const keyManager = getKeyManager();
  const encrypted = JSON.parse(encryptedValue);
  const decrypted = keyManager.decrypt(encrypted, context);
  return decrypted.toString('utf8');
};

/**
 * Hash nilai sensitif (seperti password)
 * @param {string} password - Password
 * @returns {string} Data hash (JSON string format)
 */
const hashPassword = (password) => {
  const keyManager = getKeyManager();
  const hashData = keyManager.hashPassword(password);
  return JSON.stringify(hashData);
};

/**
 * Verifikasi password dengan hash tersimpan
 * @param {string} password - Password yang akan diverifikasi
 * @param {string} storedHash - Hash tersimpan (JSON string format)
 * @returns {boolean} Apakah password valid
 */
const verifyPassword = (password, storedHash) => {
  const keyManager = getKeyManager();
  const hashData = JSON.parse(storedHash);
  return keyManager.verifyPassword(password, hashData);
};

module.exports = {
  getKeyManager,
  encryptValue,
  decryptValue,
  hashPassword,
  verifyPassword
}; 