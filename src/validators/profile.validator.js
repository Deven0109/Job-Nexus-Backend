import { body } from 'express-validator';

/**
 * Validation rules for updating user profile (shared across candidate, recruiter, employer)
 */
export const updateProfileValidation = [
    body('firstName')
        .optional()
        .trim()
        .notEmpty().withMessage('First name cannot be empty')
        .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

    body('lastName')
        .optional()
        .trim()
        .notEmpty().withMessage('Last name cannot be empty')
        .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),

    body('phone')
        .optional({ values: 'falsy' })
        .trim()
        .isMobilePhone('any')
        .withMessage('Please provide a valid phone number'),

    body('avatar')
        .optional({ values: 'falsy' })
        .isString().withMessage('Avatar must be a string'),
];
