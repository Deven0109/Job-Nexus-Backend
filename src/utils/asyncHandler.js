/**
 * Async handler wrapper for Express controllers
 * Eliminates repetitive try-catch blocks in async route handlers
 *
 * @param {Function} fn - Async middleware/controller function
 * @returns {Function} Express middleware with automatic error forwarding
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

export default asyncHandler;
