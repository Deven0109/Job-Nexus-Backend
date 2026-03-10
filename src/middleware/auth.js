import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.model.js';

/**
 * Authentication middleware
 * Verifies JWT access token from Authorization header
 * Fetches user from DB and attaches to req.user
 */
const auth = asyncHandler(async (req, res, next) => {
    let token;

    // Check Authorization header
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        throw ApiError.unauthorized('Access denied. No token provided.');
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, config.jwt.accessSecret);

        // Fetch user from DB to ensure they still exist and are active
        const user = await User.findById(decoded.id);

        if (!user) {
            throw ApiError.unauthorized('User belonging to this token no longer exists.');
        }

        if (!user.isActive) {
            throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
        }

        // Attach user info to request
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            categories: user.categories || [],
        };

        next();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error.name === 'TokenExpiredError') {
            throw ApiError.unauthorized('Access token expired.');
        }
        throw ApiError.unauthorized('Invalid token.');
    }
});

export default auth;
