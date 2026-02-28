import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000,
    message: {
        success: false,
        message: 'Too many requests, please try again after a minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Stricter rate limiter for auth endpoints
 */
export const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // Effectively unlimited for manual testing
    message: {
        success: false,
        message: 'Too many login attempts, please try again after a minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for file upload endpoints
 */
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: {
        success: false,
        message: 'Too many file uploads, please try again after an hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
