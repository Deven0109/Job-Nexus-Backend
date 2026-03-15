import Category from '../models/Category.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { masterCategories } from '../utils/categoriesList.js';
import { getIO } from '../socket.js';

/**
 * @desc Get all categories (with filtering for public/admin)
 * @route GET /api/categories
 * @access Public/Private
 */
export const getAllCategories = asyncHandler(async (req, res) => {
    const { isVisible } = req.query;
    let query = {};

    if (isVisible !== undefined) {
        query.isVisible = isVisible === 'true';
    }

    const categories = await Category.find(query).sort({ name: 1 });

    ApiResponse.success(categories, 'Categories fetched successfully').send(res);
});

/**
 * @desc Get master list of categories and their respective job titles
 * @route GET /api/categories/master
 * @access Public/Private
 */
export const getMasterCategories = asyncHandler(async (req, res) => {
    ApiResponse.success(masterCategories, 'Master categories fetched successfully').send(res);
});

/**
 * @desc Create new category
 * @route POST /api/categories
 * @access Recruiter/Admin
 */
export const createCategory = asyncHandler(async (req, res) => {
    const { name, isVisible } = req.body;

    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
        throw ApiError.badRequest('Category already exists');
    }

    const category = await Category.create({
        name,
        isVisible: isVisible !== undefined ? isVisible : true,
        createdBy: req.user.id
    });

    ApiResponse.created(category, 'Category created successfully').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'category', action: 'create' });
});

/**
 * @desc Update category
 * @route PUT /api/categories/:id
 * @access Recruiter/Admin
 */
export const updateCategory = asyncHandler(async (req, res) => {
    const { name, isVisible } = req.body;

    let category = await Category.findById(req.params.id);

    if (!category) {
        throw ApiError.notFound('Category not found');
    }

    category = await Category.findByIdAndUpdate(
        req.params.id,
        { name, isVisible },
        { new: true, runValidators: true }
    );

    ApiResponse.success(category, 'Category updated successfully').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'category', action: 'update', id: req.params.id });
});

/**
 * @desc Delete category
 * @route DELETE /api/categories/:id
 * @access Recruiter/Admin
 */
export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (!category) {
        throw ApiError.notFound('Category not found');
    }

    await category.deleteOne();

    ApiResponse.success(null, 'Category deleted successfully').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'category', action: 'delete', id: req.params.id });
});
