import { Router } from 'express';
import {
    createJobRequest,
    getMyJobRequests,
    getMyJobRequestById,
    updateJobRequest,
    cancelJobRequest,
    listJobRequests,
    getJobRequestById,
    approveJobRequest,
    rejectJobRequest,
    activateJob,
    toggleJobStatus,
    updateJobRequestByAdminRecruiter
} from '../controllers/jobRequest.controller.js';
import { createJobRequestValidation, updateJobRequestValidation } from '../validators/jobRequest.validator.js';
import validate from '../middleware/validate.js';
import auth from '../middleware/auth.js';
import authorize from '../middleware/rbac.js';

const router = Router();

// All routes require authentication
router.use(auth);

// ==================== EMPLOYER ROUTES ====================

// POST /api/job-requests — Submit a new job request
router.post('/', authorize('employer'), createJobRequestValidation, validate, createJobRequest);

// GET /api/job-requests/my — View own job requests
router.get('/my', authorize('employer'), getMyJobRequests);

// GET /api/job-requests/my/:id — View single own job request
router.get('/my/:id', authorize('employer'), getMyJobRequestById);

// PUT /api/job-requests/my/:id — Edit own pending job request
router.put('/my/:id', authorize('employer'), updateJobRequestValidation, validate, updateJobRequest);

// DELETE /api/job-requests/my/:id — Cancel own pending job request
router.delete('/my/:id', authorize('employer'), cancelJobRequest);

// ==================== RECRUITER & ADMIN SHARED ROUTES ====================

// GET /api/job-requests — List all job requests
router.get('/', authorize('recruiter', 'admin'), listJobRequests);

// GET /api/job-requests/:id — View single job request
router.get('/:id', authorize('recruiter', 'admin'), getJobRequestById);

// PATCH /api/job-requests/:id/toggle-status — Toggle between active and inactive
router.patch('/:id/toggle-status', authorize('recruiter', 'admin'), toggleJobStatus);

// PUT /api/job-requests/:id — Edit job request by recruiter/admin
router.put('/:id', authorize('recruiter', 'admin'), updateJobRequestValidation, validate, updateJobRequestByAdminRecruiter);

// ==================== RECRUITER ONLY ROUTES ====================

// PATCH /api/job-requests/:id/approve — Approve a pending request
router.patch('/:id/approve', authorize('recruiter'), approveJobRequest);

// PATCH /api/job-requests/:id/reject — Reject a pending request
router.patch('/:id/reject', authorize('recruiter'), rejectJobRequest);

// POST /api/job-requests/:id/activate — Activate an approved job request to make it public
router.post('/:id/activate', authorize('recruiter'), activateJob);

export default router;
