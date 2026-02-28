import ApiError from '../utils/ApiError.js';

/**
 * Role-Based Access Control middleware
 * Restricts access to users with specified roles
 *
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'recruiter')
 * @returns {Function} Express middleware
 *
 * Usage: router.post('/jobs', auth, authorize('recruiter', 'admin'), createJob)
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw ApiError.unauthorized('Authentication required');
        }

        if (!roles.includes(req.user.role)) {
            console.warn(`[RBAC] Access denied for user ${req.user.email}. Role: '${req.user.role}', Needed: ${roles.join(' or ')}`);
            throw ApiError.forbidden(
                `Role '${req.user.role}' is not authorized to access this resource`
            );
        }

        next();
    };
};

export default authorize;
