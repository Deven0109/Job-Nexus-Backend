import User from '../models/User.model.js';
import Application from '../models/Application.model.js';
import Job from '../models/Job.model.js';
import Candidate from '../models/Candidate.model.js';
import Employer from '../models/Employer.model.js';
import JobRequest from '../models/JobRequest.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getIO } from '../socket.js';

import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { APPLICATION_STATUS, USER_ROLES, NOTIFICATION_TYPES } from '../utils/constants.js';
import {
    createNotification,
    notifyJobRecruiters,
    notifyAdmins
} from '../services/notification.service.js';

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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'create' });

    // Notification Logic: Notify the recruiter(s) managing this job
    notifyJobRecruiters(jobId, {
        type: 'application',
        title: 'New Application Received',
        message: `${req.user.firstName} ${req.user.lastName} applied for ${job.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/recruiter/job/${job._id}/applications`
    });

    // Notification Logic: Notify Admin
    try {
        await notifyAdmins({
            type: NOTIFICATION_TYPES.APPLICATION_RECEIVED,
            title: 'New application received',
            message: `${req.user.firstName} ${req.user.lastName} applied for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/applications?jobId=${job._id}`
        });
    } catch (notifyErr) {
        console.error('Admin application notification failed:', notifyErr);
    }
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
            select: 'title location city state country workType experience salaryMin salaryMax currency companyId',
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
    let { jobId } = req.params;

    let job = await Job.findById(jobId);
    // If job not found, check if jobId is a JobRequest ID
    if (!job) {
        const jr = await JobRequest.findById(jobId);
        if (jr && jr.jobId) {
            jobId = jr.jobId;
            job = await Job.findById(jobId);
        }
    }

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
            populate: { path: 'candidateProfile', select: 'resumeUrl phone' }
        })
        .populate({
            path: 'job',
            select: 'title location city state country workType experience salaryMin salaryMax'
        })
        .sort({ createdAt: -1 })
        .lean({ virtuals: true });

    ApiResponse.success(applications, 'Job applications retrieved').send(res);
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'review', id: req.params.id });

    // Notification Logic: Notify the candidate (Case 7)
    const job = await Job.findById(application.job);
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'application',
        title: 'Application Update',
        message: `Your application for ${job?.title} is under review`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'reject', id: req.params.id });

    // Notification Logic: Notify the candidate (Case 6)
    const job = await Job.findById(application.job);
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'rejection',
        title: 'Application Rejected',
        message: `Your application for ${job?.title || 'the job'} has been rejected`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'shortlist', id: req.params.id });

    // Notification Logic: Notify the employer
    const job = await Job.findById(application.job);
    const employer = await User.findOne({ _id: job.createdByEmployer }); // Need to make sure we find the right employer user

    // In this system, companyId belongs to Employer model, which has a userId
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);

    if (employerDoc) {
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'shortlist',
            title: 'Candidate Shortlisted',
            message: `${req.user.firstName} ${req.user.lastName} has shortlisted a candidate for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/employer/jobs/${job._id}/review`
        });
    }
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'schedule', id: req.params.id });

    // Notification Logic: Notify both Candidate (Case 11/12) and Employer
    const job = await Job.findById(application.job);
    const candidateUser = await User.findById(application.candidate);
    const dateStr = new Date(scheduledAt).toLocaleDateString();
    const timeStr = new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Notify Candidate
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'interview',
        title: 'Interview Scheduled',
        message: `Interview scheduled for ${job?.title} - Round ${roundNumber} on ${dateStr} at ${timeStr}`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Employer
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);
    if (employerDoc) {
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'interview',
            title: 'Interview Scheduled',
            message: `Interview scheduled for ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title} - Round ${roundNumber} on ${dateStr} at ${timeStr}`,
            jobId: job._id,
            applicationId: application._id,
            route: '/employer/job-requests' // Or appropriate module
        });
    }
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'next-round', id: req.params.id });
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'hire', id: req.params.id });

    const job = await Job.findById(application.job).populate('companyId');
    const candidateUser = await User.findById(application.candidate);

    // 1. Notify Candidate (Case 14)
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'hire',
        title: 'Congratulations!',
        message: `You have been hired for ${job?.companyId?.companyName || 'the company'}`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Employer (Case 14)
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);
    if (employerDoc) {
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'hire',
            title: 'Candidate Hired',
            message: `${candidateUser?.firstName} ${candidateUser?.lastName} has been hired for ${job.title} in your company`,
            jobId: job._id,
            applicationId: application._id,
            route: '/employer/job-requests'
        });
    }
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'reject-after-interview', id: req.params.id });

    const job = await Job.findById(application.job);
    const candidateUser = await User.findById(application.candidate);

    // 1. Notify Candidate (Case 13)
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'rejection',
        title: 'Application Update',
        message: `Your application for ${job?.title} has been rejected`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Employer (Case 13)
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);
    if (employerDoc) {
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'rejection',
            title: 'Candidate Rejected',
            message: `${candidateUser?.firstName} ${candidateUser?.lastName} was rejected for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: '/employer/job-requests'
        });
    }
});

// ==================== EMPLOYER FLOW ====================

/**
 * @desc    Get shortlisted candidates for a job
 * @route   GET /api/employer/job/:jobId/shortlisted
 * @access  Private/Employer
 */
export const getEmployerShortlisted = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const { page = 1, limit = 6, applicationId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let targetJobId = jobId;

    const matchQuery = {
        job: targetJobId
    };

    // If no applications found, check if jobId is actually a JobRequest ID
    const countCheck = await Application.countDocuments({ job: targetJobId });
    if (countCheck === 0) {
        const jr = await JobRequest.findById(jobId);
        if (jr && jr.jobId) {
            targetJobId = jr.jobId;
            matchQuery.job = targetJobId;
        }
    }

    if (applicationId) {
        matchQuery._id = applicationId;
    }

    const total = await Application.countDocuments(matchQuery);

    const applications = await Application.find(matchQuery)
        .populate({
            path: 'candidate',
            select: 'firstName lastName email avatar phone',
            populate: { path: 'candidateProfile', select: 'resumeUrl summary skills experience education' }
        }).populate({
            path: 'job',
            select: 'title location city state country'
        })
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true });

    ApiResponse.success({
        applications,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
            hasNextPage: skip + parseInt(limit) < total,
            hasPrevPage: parseInt(page) > 1,
        }
    }, 'Shortlisted candidates retrieved').send(res);
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'employer-approve', id: req.params.id });

    // Notification Logic: Notify Candidate & Recruiter (Case 10)
    const job = await Job.findById(application.job);
    const employerUser = await User.findById(req.user.id);
    const candidateUser = await User.findById(application.candidate);

    // 1. Notify Candidate
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'shortlist',
        title: 'Application Shortlisted',
        message: `Your application for ${job?.title} has been shortlisted`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Recruiter
    notifyJobRecruiters(job._id, {
        type: 'shortlist',
        title: 'Candidate Shortlisted',
        message: `${candidateUser?.firstName} ${candidateUser?.lastName} was shortlisted by ${employerUser?.firstName} ${employerUser?.lastName} for ${job?.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/recruiter/job/${job._id}/applications`
    });
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

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'employer-reject', id: req.params.id });

    // Notification Logic: Notify Candidate & Recruiter (Case 9)
    const job = await Job.findById(application.job);
    const employerUser = await User.findById(req.user.id);
    const candidateUser = await User.findById(application.candidate);

    // 1. Notify Candidate
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'rejection',
        title: 'Application Update',
        message: `Your application for ${job?.title} has been rejected`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Recruiter
    notifyJobRecruiters(job._id, {
        type: 'rejection',
        title: 'Candidate Rejected',
        message: `${candidateUser?.firstName} ${candidateUser?.lastName} was rejected by ${employerUser?.firstName} ${employerUser?.lastName} for ${job?.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/recruiter/job/${job._id}/applications`
    });
});

/**
 * @desc    Employer Hire candidate (Final Selection)
 * @route   PUT /api/employer/application/:id/hire
 * @access  Private/Employer
 */
export const employerHire = asyncHandler(async (req, res) => {
    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.FINAL_SELECTED },
        { new: true }
    );

    if (!application) throw ApiError.notFound('Application not found');

    ApiResponse.success(application, 'Candidate hired successfully by employer').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'hire', id: req.params.id });

    const job = await Job.findById(application.job).populate('companyId');
    const employerUser = await User.findById(req.user.id);
    const candidateUser = await User.findById(application.candidate);

    // 1. Notify Candidate
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: 'hire',
        title: 'Congratulations!',
        message: `You have been hired for ${job?.companyId?.companyName || 'the company'} by ${employerUser?.firstName} ${employerUser?.lastName}`,
        jobId: application.job,
        applicationId: application._id,
        route: '/candidate/applications'
    });

    // 2. Notify Recruiter
    notifyJobRecruiters(job._id, {
        type: 'hire',
        title: 'Candidate Hired',
        message: `${candidateUser?.firstName} ${candidateUser?.lastName} has been hired by ${employerUser?.firstName} ${employerUser?.lastName} for ${job?.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/recruiter/job/${job._id}/applications`
    });
});

// ==================== PIPELINE / ADMIN VIEW ====================

/**
 * @desc    Get group-wise applications for Kanban board
 * @route   GET /api/recruiter/job/:jobId/pipeline
 * @access  Private/Recruiter,Admin
 */
export const getPipeline = asyncHandler(async (req, res) => {
    let { jobId } = req.params;

    let job = await Job.findById(jobId);
    
    // If job not found, check if jobId is a JobRequest ID
    if (!job) {
        const jr = await JobRequest.findById(jobId);
        if (jr && jr.jobId) {
            jobId = jr.jobId;
            job = await Job.findById(jobId);
        }
    }

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
            populate: { path: 'candidateProfile', select: 'resumeUrl phone experience' }
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

/**
 * @desc    Get all applications (Admin only)
 * @route   GET /api/applications/admin/all
 * @access  Private/Admin
 */
export const getAllApplicationsAdmin = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status = '', search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;

    // Search logic: name or email
    if (search) {
        const users = await User.find({
            $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        }).select('_id');
        const candidateIds = users.map(u => u._id);
        query.candidate = { $in: candidateIds };
    }

    const applications = await Application.find(query)
        .populate({
            path: 'candidate',
            select: 'firstName lastName email avatar phone',
            populate: { path: 'candidateProfile', select: 'phone city category jobCategory' }
        })
        .populate({
            path: 'job',
            select: 'title location companyId category jobCategory',
            populate: { path: 'companyId', select: 'companyName logo contactPersonPhone companyEmail' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true });

    const total = await Application.countDocuments(query);

    ApiResponse.success({
        applications,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
    }, 'All applications retrieved').send(res);
});
