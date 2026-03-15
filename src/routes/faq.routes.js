import express from 'express';
import {
    createFAQ,
    getAllFAQs,
    getFAQById,
    updateFAQ,
    deleteFAQ,
    getActiveFAQs
} from '../controllers/faq.controller.js';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/rbac.js';

const router = express.Router();

// Public route for candidate side
router.get('/active', getActiveFAQs);

// Protected routes
router.use(auth);

// Get single FAQ (Available for all authenticated users)
router.get('/:id', getFAQById);

// Admin/Recruiter restricted routes
router.use(authorize('recruiter', 'admin'));

router.get('/', getAllFAQs);
router.post('/', createFAQ);
router.put('/:id', updateFAQ);
router.delete('/:id', deleteFAQ);

export default router;
