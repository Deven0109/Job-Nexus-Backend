import { body, param, query } from 'express-validator';
import { JOB_STATUS, JOB_TYPES, EXPERIENCE_LEVELS } from '../utils/constants.js';

export const createJobValidation = [
    body('title').trim().notEmpty().withMessage('Job title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('company').trim().notEmpty().withMessage('Company name is required'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('type').optional().isIn(Object.values(JOB_TYPES)).withMessage('Invalid job type'),
    body('experienceLevel').optional().isIn(Object.values(EXPERIENCE_LEVELS)).withMessage('Invalid experience level'),
    body('salaryMin').optional().isNumeric().withMessage('Min salary must be a number'),
    body('salaryMax').optional().isNumeric().withMessage('Max salary must be a number').custom((value, { req }) => {
        if (value && req.body.salaryMin && Number(value) < Number(req.body.salaryMin)) {
            throw new Error('Max salary cannot be less than min salary');
        }
        return true;
    }),
    body('currency')
        .optional()
        .isIn(['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'SAR', 'QAR'])
        .withMessage('Invalid currency'),
    body('requiredSkills').optional().isArray().withMessage('Skills must be an array'),
    body('companyId').optional().isMongoId().withMessage('Invalid company ID'),
    body('jobRequestId').optional().isMongoId().withMessage('Invalid job request ID'),
];

export const updateJobValidation = [
    param('id').isMongoId().withMessage('Invalid job ID'),
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim().notEmpty(),
    body('salaryMin').optional().isNumeric(),
    body('salaryMax').optional().isNumeric(),
    body('currency')
        .optional()
        .isIn(['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'SAR', 'QAR']),
];
