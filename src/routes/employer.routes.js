import { Router } from 'express';
import {
    getProfile,
    updateProfile,
    getDashboard,
    getActiveJobs,
    getRecentActivity,
} from '../controllers/employer.controller.js';


import { updateProfileValidation } from '../validators/profile.validator.js';
import { createJobRequestValidation, updateJobRequestValidation } from '../validators/jobRequest.validator.js';
import { createJobRequest, getMyJobRequests, getMyJobRequestById, updateJobRequest, cancelJobRequest } from '../controllers/jobRequest.controller.js';
import validate from '../middleware/validate.js';
import auth from '../middleware/auth.js';
import authorize from '../middleware/rbac.js';

const router = Router();

// All employer routes require authentication + employer role
router.use(auth, authorize('employer'));

// ==================== DASHBOARD ====================

// GET /api/employer/dashboard — Dashboard stats
router.get('/dashboard', getDashboard);

// GET /api/employer/recent-activity — Dashboard recent activity
router.get('/recent-activity', getRecentActivity);


// ==================== PROFILE ====================

// GET /api/employer/profile — Get own profile (company info)
router.get('/profile', getProfile);

// PUT /api/employer/profile — Update own profile (company info)
router.put('/profile', updateProfileValidation, validate, updateProfile);

// ==================== JOB REQUESTS ====================

// POST /api/employer/job-request — Submit a new job request
router.post('/job-request', createJobRequestValidation, validate, createJobRequest);

// GET /api/employer/job-requests — View own job requests
router.get('/job-requests', getMyJobRequests);

// GET /api/employer/job-request/:id — View single own job request
router.get('/job-request/:id', getMyJobRequestById);

// PUT /api/employer/job-request/:id — Edit own pending job request
router.put('/job-request/:id', updateJobRequestValidation, validate, updateJobRequest);

// DELETE /api/employer/job-request/:id — Cancel own pending job request
router.delete('/job-request/:id', cancelJobRequest);

// GET /api/employer/active-jobs — View own published jobs
router.get('/active-jobs', getActiveJobs);


// ==================== FUTURE ROUTES ====================
// GET    /api/employer/jobs              — Job requests (posted by recruiter for this employer)
// GET    /api/employer/candidates        — Candidates submitted for review
// PUT    /api/employer/candidates/:id    — Approve/Reject candidate
// GET    /api/employer/interviews        — Interviews list
// POST   /api/employer/interviews        — Schedule interview
// GET    /api/employer/reports           — Placement reports

export default router;
