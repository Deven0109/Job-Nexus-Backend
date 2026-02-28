import { Router } from 'express';
import { getJobs, getJobById } from '../controllers/job.controller.js';

const router = Router();

// ==================== PUBLIC JOB ROUTES ====================

// GET /api/jobs — List all public jobs
router.get('/', getJobs);

// GET /api/jobs/:id — Get a specific job
router.get('/:id', getJobById);

export default router;
