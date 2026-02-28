import { PAGINATION } from './constants.js';

/**
 * Build pagination object from request query params
 * @param {Object} query - Express req.query
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const buildPagination = (query) => {
    const page = Math.max(1, parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE);
    const limit = Math.min(
        PAGINATION.MAX_LIMIT,
        Math.max(1, parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

/**
 * Build pagination response metadata
 * @param {number} total - Total number of documents
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object}
 */
export const paginationMeta = (total, page, limit) => ({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
});

/**
 * Build sort object from query params
 * @param {string} sortQuery - Sort string like "-createdAt,title"
 * @returns {Object} MongoDB sort object
 */
export const buildSort = (sortQuery) => {
    if (!sortQuery) return { createdAt: -1 }; // Default: newest first

    const sortObj = {};
    const fields = sortQuery.split(',');

    fields.forEach((field) => {
        if (field.startsWith('-')) {
            sortObj[field.substring(1)] = -1;
        } else {
            sortObj[field] = 1;
        }
    });

    return sortObj;
};

/**
 * Clean empty/undefined fields from an object
 * @param {Object} obj
 * @returns {Object}
 */
export const cleanObject = (obj) => {
    return Object.fromEntries(
        Object.entries(obj).filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
        )
    );
};
