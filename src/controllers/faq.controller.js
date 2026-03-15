import FAQ from '../models/FAQ.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getIO } from '../socket.js';

/**
 * @desc Create new FAQ
 * @route POST /api/faqs
 * @access Admin/Recruiter
 */
export const createFAQ = asyncHandler(async (req, res) => {
    const { question, answer, status } = req.body;

    if (!question || !answer) {
        throw ApiError.badRequest('Question and answer are required');
    }

    const faq = await FAQ.create({
        question,
        answer,
        status: status || 'active'
    });

    ApiResponse.created(faq, 'FAQ created successfully').send(res);
    
    // Notify all connected clients (Candidate, Recruiter, Admin) to refresh FAQ data
    getIO()?.emit('data:updated', { type: 'faq', action: 'create' });
});

/**
 * @desc Get all FAQs for admin
 * @route GET /api/faqs
 * @access Private
 */
export const getAllFAQs = asyncHandler(async (req, res) => {
    const { search, status } = req.query;
    let query = {};

    if (search) {
        query.$or = [
            { question: { $regex: search, $options: 'i' } },
            { answer: { $regex: search, $options: 'i' } }
        ];
    }

    if (status && status !== 'all') {
        query.status = status;
    }

    const faqs = await FAQ.find(query).sort({ createdAt: -1 });

    ApiResponse.success(faqs, 'FAQs fetched successfully').send(res);
});

/**
 * @desc Get single FAQ by id
 * @route GET /api/faqs/:id
 * @access Private
 */
export const getFAQById = asyncHandler(async (req, res) => {
    const faq = await FAQ.findById(req.params.id);

    if (!faq) {
        throw ApiError.notFound('FAQ not found');
    }

    ApiResponse.success(faq, 'FAQ fetched successfully').send(res);
});

/**
 * @desc Update FAQ
 * @route PUT /api/faqs/:id
 * @access Admin/Recruiter
 */
export const updateFAQ = asyncHandler(async (req, res) => {
    const { question, answer, status } = req.body;

    const faq = await FAQ.findById(req.params.id);

    if (!faq) {
        throw ApiError.notFound('FAQ not found');
    }

    const updatedFAQ = await FAQ.findByIdAndUpdate(
        req.params.id,
        { question, answer, status },
        { new: true, runValidators: true }
    );

    ApiResponse.success(updatedFAQ, 'FAQ updated successfully').send(res);
    
    // Notify all connected clients
    getIO()?.emit('data:updated', { type: 'faq', action: 'update', id: req.params.id });
});

/**
 * @desc Delete FAQ
 * @route DELETE /api/faqs/:id
 * @access Admin/Recruiter
 */
export const deleteFAQ = asyncHandler(async (req, res) => {
    const faq = await FAQ.findById(req.params.id);

    if (!faq) {
        throw ApiError.notFound('FAQ not found');
    }

    await faq.deleteOne();

    ApiResponse.success(null, 'FAQ deleted successfully').send(res);
    
    // Notify all connected clients
    getIO()?.emit('data:updated', { type: 'faq', action: 'delete', id: req.params.id });
});

/**
 * @desc Get active FAQs for candidate
 * @route GET /api/faqs/active
 * @access Public
 */
export const getActiveFAQs = asyncHandler(async (req, res) => {
    const faqs = await FAQ.find({ status: 'active' }).sort({ createdAt: 1 });
    ApiResponse.success(faqs, 'Active FAQs fetched successfully').send(res);
});
