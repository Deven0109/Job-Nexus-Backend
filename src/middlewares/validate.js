import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/**
 * Validation middleware
 * Checks express-validator validation results and returns structured errors
 *
 * Usage: router.post('/register', [...validationRules], validate, registerController)
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const extractedErrors = errors.array().map((err) => ({
            field: err.path,
            message: err.msg,
        }));

        return next(ApiError.badRequest('Validation failed', extractedErrors));
    }

    next();
};

export default validate;
