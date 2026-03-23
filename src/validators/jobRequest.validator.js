import { body } from 'express-validator';

export const createJobRequestValidation = [
    body('jobTitle')
        .custom((value, { req }) => {
            const val = value || req.body.position;
            if (!val || !String(val).trim()) {
                throw new Error('Job title is required');
            }
            if (String(val).trim().length > 200) {
                throw new Error('Job title cannot exceed 200 characters');
            }
            return true;
        }),

    body('jobCategory')
        .trim()
        .notEmpty().withMessage('Category is required'),

    body('numberOfVacancies')
        .isInt({ min: 1 }).withMessage('At least 1 vacancy is required'),

    body('experienceRequired')
        .trim()
        .notEmpty().withMessage('Experience is required'),

    body('salaryMin')
        .isFloat({ min: 0 }).withMessage('Minimum salary must be 0 or more'),

    body('salaryMax')
        .isFloat({ min: 0 }).withMessage('Maximum salary must be 0 or more')
        .custom((value, { req }) => {
            if (Number(value) < Number(req.body.salaryMin)) {
                throw new Error('Maximum salary must be greater than or equal to minimum salary');
            }
            return true;
        }),

    body('workType')
        .isIn(['Remote', 'Hybrid', 'Onsite'])
        .withMessage('Work type must be Remote, Hybrid, or Onsite'),

    body('country')
        .trim()
        .notEmpty().withMessage('Country is required'),

    body('state')
        .trim()
        .notEmpty().withMessage('State is required'),

    body('city')
        .trim()
        .notEmpty().withMessage('City is required'),

    body('pincode')
        .optional()
        .trim(),

    body('requiredSkills')
        .isArray({ min: 1 }).withMessage('At least one skill is required'),

    body('requiredSkills.*')
        .trim()
        .notEmpty().withMessage('Skill cannot be empty'),

    body('jobDescription')
        .trim()
        .notEmpty().withMessage('Description is required')
        .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),

    body('urgency')
        .isIn(['Low', 'Medium', 'High'])
        .withMessage('Urgency must be Low, Medium, or High'),

    body('currency')
        .optional()
        .isIn(['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'SAR', 'QAR'])
        .withMessage('Invalid currency'),
];

export const updateJobRequestValidation = [
    body('jobTitle')
        .optional()
        .trim()
        .notEmpty().withMessage('Job title cannot be empty')
        .isLength({ max: 200 }).withMessage('Job title cannot exceed 200 characters'),

    body('position')
        .optional()
        .trim()
        .notEmpty().withMessage('Position cannot be empty')
        .isLength({ max: 200 }).withMessage('Position cannot exceed 200 characters'),

    body('jobCategory')
        .optional()
        .trim()
        .notEmpty().withMessage('Category cannot be empty'),

    body('numberOfVacancies')
        .optional()
        .isInt({ min: 1 }).withMessage('At least 1 vacancy is required'),

    body('experienceRequired')
        .optional()
        .trim()
        .notEmpty().withMessage('Experience cannot be empty'),

    body('salaryMin')
        .optional()
        .isFloat({ min: 0 }).withMessage('Minimum salary must be 0 or more'),

    body('salaryMax')
        .optional()
        .isFloat({ min: 0 }).withMessage('Maximum salary must be 0 or more'),

    body('workType')
        .optional()
        .isIn(['Remote', 'Hybrid', 'Onsite'])
        .withMessage('Work type must be Remote, Hybrid, or Onsite'),

    body('country')
        .optional()
        .trim()
        .notEmpty().withMessage('Country cannot be empty'),

    body('state')
        .optional()
        .trim()
        .notEmpty().withMessage('State cannot be empty'),

    body('city')
        .optional()
        .trim()
        .notEmpty().withMessage('City cannot be empty'),

    body('pincode')
        .optional()
        .trim(),

    body('requiredSkills')
        .optional()
        .isArray({ min: 1 }).withMessage('At least one skill is required'),

    body('jobDescription')
        .optional()
        .trim()
        .notEmpty().withMessage('Description cannot be empty')
        .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),

    body('urgency')
        .optional()
        .isIn(['Low', 'Medium', 'High'])
        .withMessage('Urgency must be Low, Medium, or High'),

    body('currency')
        .optional()
        .isIn(['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'SAR', 'QAR'])
        .withMessage('Invalid currency'),
];
