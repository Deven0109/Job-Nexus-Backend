import express from 'express';
import * as applicationController from '../controllers/application.controller.js';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/rbac.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// ==================== CANDIDATE ROUTES ====================

// Apply for a job
router.post(
    '/apply/:jobId',
    auth,
    authorize(USER_ROLES.CANDIDATE),
    applicationController.applyToJob
);

// Get my applications
router.get(
    '/my',
    auth,
    authorize(USER_ROLES.CANDIDATE),
    applicationController.getMyApplications
);


// ==================== RECRUITER ROUTES ====================

// Get all applications for a job
router.get(
    '/recruiter/job/:jobId',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.getJobApplications
);

// Get Kanban pipeline for a job
router.get(
    '/recruiter/job/:jobId/pipeline',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN),
    applicationController.getPipeline
);


// Review application
router.put(
    '/recruiter/application/:id/review',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.reviewApplication
);

// Reject candidate (Initial)
router.put(
    '/recruiter/application/:id/reject',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.rejectApplication
);

// Shortlist candidate (Send to employer)
router.put(
    '/recruiter/application/:id/shortlist',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.shortlistApplication
);

// Schedule interview
router.put(
    '/recruiter/application/:id/schedule-interview',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.scheduleInterview
);

// Next round selection
router.put(
    '/recruiter/application/:id/next-round',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.nextRound
);

// Final selection
router.put(
    '/recruiter/application/:id/final-select',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.finalSelect
);

// Final rejection (after interview)
router.put(
    '/recruiter/application/:id/reject-after-interview',
    auth,
    authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
    applicationController.finalReject
);


// ==================== EMPLOYER ROUTES ====================

// Get candidates shortlisted for my job
router.get(
    '/employer/job/:jobId/shortlisted',
    auth,
    authorize(USER_ROLES.EMPLOYER, USER_ROLES.ADMIN),
    applicationController.getEmployerShortlisted
);

// Employer approve candidate
router.put(
    '/employer/application/:id/approve',
    auth,
    authorize(USER_ROLES.EMPLOYER, USER_ROLES.ADMIN),
    applicationController.employerApprove
);

// Employer reject candidate
router.put(
    '/employer/application/:id/reject',
    auth,
    authorize(USER_ROLES.EMPLOYER, USER_ROLES.ADMIN),
    applicationController.employerReject
);

// Employer hire candidate
router.put(
    '/employer/application/:id/hire',
    auth,
    authorize(USER_ROLES.EMPLOYER, USER_ROLES.ADMIN),
    applicationController.employerHire
);

// ==================== ADMIN ROUTES ====================

// Get all applications (Admin only)
router.get(
    '/admin/all',
    auth,
    authorize(USER_ROLES.ADMIN),
    applicationController.getAllApplicationsAdmin
);

export default router;
