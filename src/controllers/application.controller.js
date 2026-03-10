import Application from '../models/Application.model.js';
import Job from '../models/Job.model.js';
import Candidate from '../models/Candidate.model.js';
import Employer from '../models/Employer.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import asyncHandler from '../utils/asyncHandler.js';

import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { APPLICATION_STATUS, USER_ROLES } from '../utils/constants.js';

// ==================== CANDIDATE FLOW ====================

/**
 * @desc    Apply for a job
 * @route   POST /api/applications/apply/:jobId
 * @access  Private/Candidate
 */
export const applyToJob = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    if (req.user.role !== USER_ROLES.CANDIDATE) {
        throw ApiError.forbidden('Only candidates can apply for jobs');
    }

    // Check if candidate has a resume
    const candidateProfile = await Candidate.findOne({ user: req.user.id });
    if (!candidateProfile || !candidateProfile.resumeUrl) {
        throw ApiError.badRequest('Upload resume first before applying');
    }

    // Check if job exists and is active
    const job = await Job.findById(jobId);
    if (!job || job.status !== 'active') {
        throw ApiError.notFound('Job not found or is no longer accepting applications');
    }

    // Check for duplicate application
    const existingApplication = await Application.findOne({
        job: jobId,
        candidate: req.user.id
    });

    if (existingApplication) {
        throw ApiError.conflict('You have already applied for this job');
    }

    // Create application
    const application = await Application.create({
        job: jobId,
        candidate: req.user.id,
        resumeUrl: candidateProfile.resumeUrl,
        status: APPLICATION_STATUS.APPLIED
    });

    ApiResponse.created(application, 'Application submitted successfully').send(res);
});

/**
 * @desc    Get candidate's own applications
 * @route   GET /api/applications/my
 * @access  Private/Candidate
 */
export const getMyApplications = asyncHandler(async (req, res) => {
    const applications = await Application.find({ candidate: req.user.id })
        .populate({
            path: 'job',
            select: 'title location city state country workType experience salaryMin salaryMax companyId',
            populate: { path: 'companyId', select: 'companyName' }
        })
        .sort({ createdAt: -1 });

    ApiResponse.success(applications, 'My applications retrieved').send(res);
});

// ==================== RECRUITER FLOW ====================

/**
 * @desc    Get applications for a specific job
 * @route   GET /api/recruiter/applications/:jobId
 * @access  Private/Recruiter
 */
export const getJobApplications = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) throw ApiError.notFound('Job not found');

    if (req.user.role === USER_ROLES.RECRUITER) {
        if (job.createdByRecruiter.toString() !== req.user.id.toString()) {
            const categoryMapping = await RecruiterCategory.findOne({ recruiterId: req.user.id, categoryName: job.category });
            if (!categoryMapping || !categoryMapping.selectedJobTitles.includes(job.title)) {
                throw ApiError.forbidden('You do not manage this job');
            }
        }
    }

    const applications = await Application.find({ job: jobId })
        .populate({
            path: 'candidate',
            select: 'firstName lastName email avatar phone',
        })
        .populate({
            path: 'job',
            select: 'title location city state country workType experience salaryMin salaryMax'
        })
        .sort({ createdAt: -1 });

    // Note: We might need to populate Candidate details from Candidate model too if needed
    // But User model usually has the basics. Let's add Candidate profile populating.
    const enrichedApplications = await Promise.all(applications.map(async (app) => {
        const profile = await Candidate.findOne({ user: app.candidate._id }).select('resumeUrl phone');
        return {
            ...app.toObject(),
            candidateProfile: profile
        };
    }));

    ApiResponse.success(enrichedApplications, 'Job applications retrieved').send(res);
});

/**
 * @desc    Update application status to Under Review
 * @route   PUT /api/recruiter/application/:id/review
 * @access  Private/Recruiter
 */
export const reviewApplication = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.UNDER_REVIEW },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Application moved to Under Review').send(res);
});

/**
 * @desc    Reject candidate
 * @route   PUT /api/recruiter/application/:id/reject
 * @access  Private/Recruiter
 */
export const rejectApplication = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.RECRUITER_REJECTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate rejected by recruiter').send(res);
});

/**
 * @desc    Shortlist candidate (Internal)
 * @route   PUT /api/recruiter/application/:id/shortlist
 * @access  Private/Recruiter
 */
export const shortlistApplication = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.RECRUITER_SHORTLISTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate shortlisted and sent to employer').send(res);
});

/**
 * @desc    Schedule interview
 * @route   PUT /api/recruiter/application/:id/schedule-interview
 * @access  Private/Recruiter
 */
export const scheduleInterview = asyncHandler(async (req, res) => {
    const { roundNumber, meetLink, meetCode, scheduledAt } = req.body;

    const application = await Application.findById(req.params.id);
    if (!application) throw ApiError.notFound('Application not found');

    application.interviewRounds.push({
        roundNumber,
        meetLink,
        meetCode,
        scheduledAt,
        createdBy: req.user.id
    });

    application.status = APPLICATION_STATUS.INTERVIEW_SCHEDULED;
    await application.save();

    ApiResponse.success(application, 'Interview scheduled successfully').send(res);
});

/**
 * @desc    Update status after interview (Next Round)
 * @route   PUT /api/recruiter/application/:id/next-round
 * @access  Private/Recruiter
 */
export const nextRound = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.SELECTED_NEXT_ROUND },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate selected for next round').send(res);
});

/**
 * @desc    Final selection
 * @route   PUT /api/recruiter/application/:id/final-select
 * @access  Private/Recruiter
 */
export const finalSelect = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.FINAL_SELECTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate finally selected').send(res);
});

/**
 * @desc    Final rejection (after interview)
 * @route   PUT /api/recruiter/application/:id/reject-after-interview
 * @access  Private/Recruiter
 */
export const finalReject = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.FINAL_REJECTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate rejected after interview').send(res);
});

// ==================== EMPLOYER FLOW ====================

/**
 * @desc    Get shortlisted candidates for a job
 * @route   GET /api/employer/job/:jobId/shortlisted
 * @access  Private/Employer
 */
export const getEmployerShortlisted = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const applications = await Application.find({
        job: jobId,
        status: APPLICATION_STATUS.RECRUITER_SHORTLISTED
    }).populate({
        path: 'candidate',
        select: 'firstName lastName email avatar phone',
    }).populate({
        path: 'job',
        select: 'title location city state country'
    });

    const enrichedApplications = await Promise.all(applications.map(async (app) => {
        const profile = await Candidate.findOne({ user: app.candidate._id }).select('resumeUrl summary skills experience education');
        return {
            ...app.toObject(),
            candidateProfile: profile
        };
    }));

    ApiResponse.success(enrichedApplications, 'Shortlisted candidates retrieved').send(res);
});

/**
 * @desc    Employer approve candidate
 * @route   PUT /api/employer/application/:id/approve
 * @access  Private/Employer
 */
export const employerApprove = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.EMPLOYER_SHORTLISTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate approved by employer').send(res);
});

/**
 * @desc    Employer reject candidate
 * @route   PUT /api/employer/application/:id/reject
 * @access  Private/Employer
 */
export const employerReject = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.EMPLOYER_REJECTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate rejected by employer').send(res);
});

// ==================== PIPELINE / ADMIN VIEW ====================

/**
 * @desc    Get group-wise applications for Kanban board
 * @route   GET /api/recruiter/job/:jobId/pipeline
 * @access  Private/Recruiter,Admin
 */
export const getPipeline = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) throw ApiError.notFound('Job not found');

    if (req.user.role === USER_ROLES.RECRUITER) {
        if (job.createdByRecruiter.toString() !== req.user.id.toString()) {
            const categoryMapping = await RecruiterCategory.findOne({ recruiterId: req.user.id, categoryName: job.category });
            if (!categoryMapping || !categoryMapping.selectedJobTitles.includes(job.title)) {
                throw ApiError.forbidden('You do not manage this job');
            }
        }
    }

    // Security: Employer can only see their own job pipelines
    if (req.user.role === USER_ROLES.EMPLOYER) {
        const employer = await Employer.findOne({ userId: req.user.id });

        if (!employer || job.companyId.toString() !== employer._id.toString()) {
            throw ApiError.forbidden('You do not have permission to view this pipeline');
        }
    }

    const applications = await Application.find({ job: jobId })
        .populate({
            path: 'candidate',
            select: 'firstName lastName email avatar phone',
        });

    const pipeline = {
        [APPLICATION_STATUS.APPLIED]: [],
        [APPLICATION_STATUS.UNDER_REVIEW]: [],

        [APPLICATION_STATUS.RECRUITER_SHORTLISTED]: [],
        [APPLICATION_STATUS.EMPLOYER_SHORTLISTED]: [],
        [APPLICATION_STATUS.INTERVIEW_SCHEDULED]: [],
        [APPLICATION_STATUS.SELECTED_NEXT_ROUND]: [],
        [APPLICATION_STATUS.FINAL_SELECTED]: [],
        [APPLICATION_STATUS.FINAL_REJECTED]: [],
    };

    applications.forEach(app => {
        if (pipeline[app.status]) {
            pipeline[app.status].push(app);
        } else if (app.status === APPLICATION_STATUS.RECRUITER_REJECTED || app.status === APPLICATION_STATUS.EMPLOYER_REJECTED) {
            // Group all rejections into Final Rejected for the Kanji board view
            pipeline[APPLICATION_STATUS.FINAL_REJECTED].push(app);
        }
    });

    ApiResponse.success(pipeline, 'Job pipeline retrieved').send(res);
});
