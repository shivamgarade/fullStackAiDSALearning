const { Router } = require('express');
const validators = require('../middlewares/validator.middleware')
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', validators.registerUserValidations, authController.registerUser);
router.post('/login', validators.loginUserValidations, authController.loginUser);

// GET /api/auth/me
router.get('/me',authMiddleware, authController.getCurrentUser);

// GET /api/auth/logout
router.get('/logout', authController.logoutUser);

module.exports = router;
