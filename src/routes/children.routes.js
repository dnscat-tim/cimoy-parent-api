const express = require('express');
const router = express.Router();
const childrenController = require('../controllers/children.controller');
const { verifyToken, verifyChildOwnership } = require('../middlewares/auth.middleware');

// Semua rute membutuhkan autentikasi
router.use(verifyToken);

// Rute untuk mendapatkan semua anak
router.get('/', childrenController.getChildren);

// Rute untuk menambahkan anak baru
router.post('/', childrenController.addChild);

// Rute berikut memerlukan verifikasi kepemilikan anak
router.get('/:id', verifyChildOwnership, childrenController.getChild);
router.put('/:id', verifyChildOwnership, childrenController.updateChild);
router.delete('/:id', verifyChildOwnership, childrenController.deleteChild);

// Rute untuk pengelolaan device
router.post('/:id/register-device', verifyChildOwnership, childrenController.registerDevice);

// Rute untuk pengaturan screen time
router.put('/:id/screen-time', verifyChildOwnership, childrenController.setScreenTimeLimit);

module.exports = router; 