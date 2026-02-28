import { Router } from 'express';
import {
    register,
    login,
    refreshTokenHandler,
    logout,
    getMe,
    changePassword,
    updateProfile,
    forgotPassword,
    verifyOTP,
    resetPassword,
    verifyLoginOtp,
    resendLoginOtp,
} from '../controllers/auth.controller.js';
import {
    registerValidation,
    loginValidation,
    changePasswordValidation,
} from '../validators/auth.validator.js';
import validate from '../middleware/validate.js';
import auth from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ==================== PUBLIC ROUTES ====================

// POST /api/auth/register — Register a new user
router.post('/register', authLimiter, registerValidation, validate, register);

// POST /api/auth/login — Login user
router.post('/login', authLimiter, loginValidation, validate, login);

// POST /api/auth/refresh-token — Refresh access token
router.post('/refresh-token', refreshTokenHandler);

// ==================== PROTECTED ROUTES ====================

// GET /api/auth/me — Get current user profile
router.get('/me', auth, getMe);

// POST /api/auth/logout — Logout user
router.post('/logout', auth, logout);

// PUT /api/auth/change-password — Change password
router.put('/change-password', auth, changePasswordValidation, validate, changePassword);

// PUT /api/auth/update-profile — Update profile
router.put('/update-profile', auth, updateProfile);

// ==================== PLACEHOLDER ROUTES (Day 3) ====================
// POST /api/auth/forgot-password — Request password reset OTP
router.post('/forgot-password', authLimiter, forgotPassword);

// POST /api/auth/verify-otp — Verify OTP
router.post('/verify-otp', authLimiter, verifyOTP);

// POST /api/auth/reset-password — Reset password
router.post('/reset-password', authLimiter, resetPassword);

// ==================== FIRST LOGIN OTP ROUTES ====================

// POST /api/auth/verify-login-otp — Verify first login OTP
router.post('/verify-login-otp', authLimiter, verifyLoginOtp);

// POST /api/auth/resend-login-otp — Resend first login OTP
router.post('/resend-login-otp', authLimiter, resendLoginOtp);

export default router;
