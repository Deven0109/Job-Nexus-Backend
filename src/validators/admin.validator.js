import { body, param, query } from 'express-validator';
import { USER_ROLES } from '../utils/constants.js';

/**
 * Validation: Admin creates a user (can assign any role)
 */
export const createUserValidation = [
    body('firstName')
        .trim()
        .notEmpty().withMessage('First name is required')
        .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
    body('lastName')
        .trim()
        .notEmpty().withMessage('Last name is required')
        .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must include uppercase, lowercase, number, and special character'),
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(Object.values(USER_ROLES)).withMessage('Invalid role'),
    body('phone')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters'),
];

/**
 * Validation: Admin updates a user
 */
export const updateUserValidation = [
    param('id')
        .isMongoId().withMessage('Invalid user ID'),
    body('firstName')
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
    body('lastName')
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('role')
        .optional()
        .isIn(Object.values(USER_ROLES)).withMessage('Invalid role'),
    body('phone')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters'),
    body('isActive')
        .optional()
        .isBoolean().withMessage('isActive must be a boolean'),
];


/**
 * Validation: List users query params
 */
export const listUsersValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('role')
        .optional()
        .isIn(Object.values(USER_ROLES)).withMessage('Invalid role filter'),
    query('search')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Search query too long'),
    query('isActive')
        .optional()
        .isIn(['true', 'false']).withMessage('isActive must be true or false'),
    query('sort')
        .optional()
        .trim(),
];
