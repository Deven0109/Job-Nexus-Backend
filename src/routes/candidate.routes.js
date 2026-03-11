import { Router } from 'express';
import {
    getProfile,
    updateProfile,
    getDashboard,
    parseResume
} from '../controllers/candidate.controller.js';
import { updateProfileValidation } from '../validators/profile.validator.js';
import validate from '../middlewares/validate.js';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/rbac.js';
import { uploadResumeMemory } from '../middlewares/upload.js';

const router = Router();

// All candidate routes require authentication + candidate role
router.use(auth, authorize('candidate'));

// ==================== DASHBOARD ====================

// GET /api/candidate/dashboard — Dashboard stats
router.get('/dashboard', getDashboard);

// ==================== PROFILE ====================

// GET /api/candidate/profile — Get own profile
router.get('/profile', getProfile);

// PUT /api/candidate/profile — Update own profile
router.put('/profile', updateProfileValidation, validate, updateProfile);

// ==================== RESUME ====================
// POST /api/candidate/resume/parse — Extract details from resume
router.post('/resume/parse', uploadResumeMemory.single('resume'), parseResume);

// ==================== FUTURE ROUTES ====================
// GET    /api/candidate/applications       — My applications
// GET    /api/candidate/applications/:id   — Single application
// POST   /api/candidate/applications       — Apply for a job
// DELETE /api/candidate/applications/:id   — Withdraw application
// GET    /api/candidate/interviews          — My interviews
// GET    /api/candidate/offers              — My offers
// PUT    /api/candidate/offers/:id/respond  — Accept/Reject offer

export default router;
