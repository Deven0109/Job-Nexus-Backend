import { Router } from 'express';
import { getJobs, getJobById, getPopularCategories, getAvailableCategories } from '../controllers/job.controller.js';

const router = Router();

// ==================== PUBLIC JOB ROUTES ====================

// GET /api/jobs — List all public jobs
router.get('/', getJobs);

// GET /api/jobs/popular-categories - get top 5 popular job categories
router.get('/popular-categories', getPopularCategories);

// GET /api/jobs/available-categories - get all job categories managed by at least one recruiter
router.get('/available-categories', getAvailableCategories);

// GET /api/jobs/:id — Get a specific job
router.get('/:id', getJobById);

export default router;
