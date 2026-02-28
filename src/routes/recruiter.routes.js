import { Router } from 'express';
import {
    getProfile,
    updateProfile,
    getDashboard,
    listCandidates,
    createJob,
    getMyJobs,
    updateJob,
    deleteJob,
    toggleJobStatus,
} from '../controllers/recruiter.controller.js';
import { updateProfileValidation } from '../validators/profile.validator.js';
import { createJobValidation } from '../validators/job.validator.js';
import validate from '../middleware/validate.js';
import auth from '../middleware/auth.js';
import authorize from '../middleware/rbac.js';

const router = Router();

// All recruiter routes require authentication + recruiter (or admin) role
router.use(auth, authorize('recruiter', 'admin'));

// ==================== DASHBOARD ====================

// GET /api/recruiter/dashboard — Dashboard stats
router.get('/dashboard', getDashboard);

// ==================== PROFILE ====================

// GET /api/recruiter/profile — Get own profile
router.get('/profile', getProfile);

// PUT /api/recruiter/profile — Update own profile
router.put('/profile', updateProfileValidation, validate, updateProfile);

// ==================== CANDIDATES ====================

// GET /api/recruiter/candidates — List candidates for pipeline
router.get('/candidates', listCandidates);

// ==================== JOBS ====================

// GET /api/recruiter/jobs — Manage jobs
router.get('/jobs', getMyJobs);

// POST /api/recruiter/jobs — Create job
router.post('/jobs', createJobValidation, validate, createJob);

// PUT /api/recruiter/jobs/:id — Update job
router.put('/jobs/:id', createJobValidation, validate, updateJob);

// DELETE /api/recruiter/jobs/:id — Delete job
router.delete('/jobs/:id', deleteJob);

// PATCH /api/recruiter/jobs/:id/toggle-status — Toggle job status (active/inactive)
router.patch('/jobs/:id/toggle-status', toggleJobStatus);

// ==================== FUTURE ROUTES ====================
// PUT    /api/recruiter/jobs/:id          — Update job
// DELETE /api/recruiter/jobs/:id          — Delete job
// GET    /api/recruiter/pipeline          — Pipeline board
// PATCH  /api/recruiter/pipeline/:id/move — Move candidate in pipeline
// GET    /api/recruiter/interviews        — Interviews list
// POST   /api/recruiter/interviews        — Schedule interview
// GET    /api/recruiter/offers            — Offers list
// POST   /api/recruiter/offers            — Create offer
// GET    /api/recruiter/reports           — Reports & analytics

export default router;
