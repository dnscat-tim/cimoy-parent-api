const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { generateToken, generateTokenPair } = require('../security/jwt');
const { securityLogger } = require('../utils/logger');
const { parentApiValidation } = require('../middlewares/validator.middleware');
const { authJWT } = require('../middlewares/auth.middleware');

// Simulasi database pengguna (untuk testing, nantinya akan menggunakan database sesungguhnya)
const users = [
  {
    id: 1,
    username: 'admin',
    password: '$2b$10$N6oYNXtUGNJKQvGcuXJJx.abk2KlTh5XQlAp5CvvJzzBZng2jEjMq', // 'admin123'
    role: 'parent',
    name: 'Admin Utama',
    email: 'admin@tracas.id',
    deviceId: 'admin-device-001'
  },
  {
    id: 2,
    username: 'child1',
    password: '$2b$10$uDIhM7Yj2LCsRk9bJYDYxeggEQXfDpAU5nrjgv9CUzS.mEU/SQSte', // 'child123'
    role: 'child',
    name: 'Anak 1',
    parentId: 1,
    deviceId: 'child-device-001'
  }
];

// Hitung jumlah percobaan login per IP
const loginAttempts = {};

/**
 * @route POST /api/auth/login
 * @desc Login user dan generate token
 * @access Public
 */
router.post('/login', parentApiValidation.login, (req, res) => {
  const { username, password } = req.body;
  const deviceId = req.body.deviceId || req.headers['x-device-id'] || 'unknown-device';
  
  // Track login attempts
  const clientIp = req.ip;
  loginAttempts[clientIp] = (loginAttempts[clientIp] || 0) + 1;
  
  // Cari user berdasarkan username
  const user = users.find(u => u.username === username);
  
  if (!user) {
    securityLogger.logAuth(false, 'User not found', {
      username,
      ip: clientIp,
      attempts: loginAttempts[clientIp]
    });
    
    return res.status(401).json({
      success: false,
      message: 'Username atau password salah'
    });
  }
  
  // Verifikasi password
  bcrypt.compare(password, user.password, (err, isMatch) => {
    if (err) {
      securityLogger.logAuth(false, 'Password verification error', {
        userId: user.id,
        ip: clientIp,
        error: err.message
      });
      
      return res.status(500).json({
        success: false,
        message: 'Error saat verifikasi password'
      });
    }
    
    if (!isMatch) {
      securityLogger.logAuth(false, 'Password mismatch', {
        userId: user.id,
        ip: clientIp,
        attempts: loginAttempts[clientIp]
      });
      
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }
    
    // Reset login attempts
    loginAttempts[clientIp] = 0;
    
    // Log successful login
    securityLogger.logAuth(true, 'Login successful', {
      userId: user.id,
      ip: clientIp,
      role: user.role
    });
    
    // Buat payload untuk token
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      deviceId: deviceId
    };
    
    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(payload);
    
    // Kirim token ke client
    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        email: user.email
      }
    });
  });
});

/**
 * @route POST /api/auth/refresh-token
 * @desc Refresh token
 * @access Public
 */
router.post('/refresh-token', parentApiValidation.refreshToken, (req, res) => {
  const { refreshToken } = req.body;
  
  try {
    const { refreshTokens } = require('../security/jwt');
    const tokenPair = refreshTokens(refreshToken);
    
    res.json({
      success: true,
      ...tokenPair
    });
  } catch (error) {
    securityLogger.logAuth(false, 'Token refresh failed', {
      ip: req.ip,
      error: error.message
    });
    
    return res.status(401).json({
      success: false,
      message: 'Refresh token tidak valid atau telah kedaluwarsa'
    });
  }
});

/**
 * @route POST /api/auth/register
 * @desc Register user baru
 * @access Public
 */
router.post('/register', parentApiValidation.register, (req, res) => {
  const { username, password, name, email, role } = req.body;
  const deviceId = req.body.deviceId || req.headers['x-device-id'] || 'unknown-device';
  
  // Cek apakah username sudah ada
  if (users.find(u => u.username === username)) {
    return res.status(400).json({
      success: false,
      message: 'Username sudah digunakan'
    });
  }
  
  // Cek apakah email sudah ada
  if (users.find(u => u.email === email)) {
    return res.status(400).json({
      success: false,
      message: 'Email sudah digunakan'
    });
  }
  
  // Hash password
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      securityLogger.logAuth(false, 'Password hashing error', {
        ip: req.ip,
        error: err.message
      });
      
      return res.status(500).json({
        success: false,
        message: 'Error saat hashing password'
      });
    }
    
    // Buat user baru
    const newUser = {
      id: users.length + 1,
      username,
      password: hash,
      name,
      email,
      role: role || 'parent',
      deviceId
    };
    
    // Simpan user (dalam contoh ini hanya ditambahkan ke array)
    users.push(newUser);
    
    // Log successful registration
    securityLogger.logAuth(true, 'Registration successful', {
      userId: newUser.id,
      ip: req.ip,
      role: newUser.role
    });
    
    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  });
});

/**
 * @route GET /api/auth/verify
 * @desc Verifikasi token dan dapatkan data user
 * @access Private
 */
router.get('/verify', authJWT(), (req, res) => {
  // Cari user berdasarkan id yang ada di req.user (dari middleware authJWT)
  const user = users.find(u => u.id === req.user.userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User tidak ditemukan'
    });
  }
  
  // Kirim data user
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post('/logout', authJWT(), (req, res) => {
  // Pada implementasi nyata, kita akan menambahkan token ke blacklist

  // Log logout
  securityLogger.logAuth(true, 'Logout successful', {
    userId: req.user.userId,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Logout berhasil'
  });
});

module.exports = router; 