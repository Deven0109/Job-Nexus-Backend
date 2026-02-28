import jwt from 'jsonwebtoken';
import config from '../config/env.js';

/**
 * Generate JWT Access Token (short-lived)
 * @param {Object} payload - User data for token payload
 * @returns {string} Signed JWT access token
 */
export const generateAccessToken = (payload) => {
    return jwt.sign(payload, config.jwt.accessSecret, {
        expiresIn: config.jwt.accessExpiry,
    });
};

/**
 * Generate JWT Refresh Token (long-lived)
 * @param {Object} payload - User data for token payload
 * @returns {string} Signed JWT refresh token
 */
export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiry,
    });
};

/**
 * Generate both Access and Refresh tokens
 * @param {Object} user - User document (must have getJWTPayload method)
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export const generateTokenPair = (user) => {
    const payload = user.getJWTPayload();

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ id: payload.id });

    return { accessToken, refreshToken };
};

/**
 * Verify access token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwt.accessSecret);
};

/**
 * Verify refresh token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwt.refreshSecret);
};

/**
 * Cookie options for refresh token
 */
export const getRefreshTokenCookieOptions = () => ({
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: config.env === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
});
