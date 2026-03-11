import ApiError from '../utils/ApiError.js';
import config from '../config/env.js';

/**
 * Global Error Handler Middleware
 * Handles all errors passed via next(error) or thrown in async handlers
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;

    // Log error in development
    if (config.env === 'development') {
        console.error('❌ Error:', {
            message: error.message,
            statusCode: error.statusCode,
            stack: error.stack,
            url: req.originalUrl,
            method: req.method,
        });
    }

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found with id: ${err.value}`;
        error = ApiError.notFound(message);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `Duplicate value for field: ${field}. Please use another value.`;
        error = ApiError.conflict(message);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map((val) => ({
            field: val.path,
            message: val.message,
        }));
        const message = 'Validation failed';
        error = ApiError.badRequest(message, errors);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        error = ApiError.unauthorized('Invalid token');
    }

    if (err.name === 'TokenExpiredError') {
        error = ApiError.unauthorized('Token expired');
    }

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = ApiError.badRequest('File too large');
    }

    // Default response
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        errors: error.errors || [],
        ...(config.env === 'development' && { stack: error.stack }),
    });
};

export default errorHandler;
