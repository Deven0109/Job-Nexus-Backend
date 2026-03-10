import express from 'express';
import {
    getAllCategories,
    getMasterCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from '../controllers/category.controller.js';
import auth from '../middleware/auth.js';
import authorize from '../middleware/rbac.js';

const router = express.Router();

/**
 * @route   GET /api/categories
 * @access  Public (Filterable by visibility)
 */
router.get('/', getAllCategories);
router.get('/master', getMasterCategories);

/**
 * Protected routes - Recruiter and Admin only
 */
router.use(auth);
router.use(authorize('recruiter', 'admin'));

router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
