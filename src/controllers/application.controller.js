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
import { paginationMeta } from '../utils/helpers.js';
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
            populate: { path: 'candidateProfile', select: 'resumeUrl phone summary skills experience education city state country' }
        })
        .populate('candidateProfile')
        .populate({
            path: 'job',
            select: 'title location city state country workType experience salaryMin salaryMax currency'
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
    const existing = await Application.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Application not found');

    // Prevent duplicate review actions
    if (existing.status !== APPLICATION_STATUS.APPLIED) {
        return ApiResponse.success(existing, 'Application is already under review or processed').send(res);
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.UNDER_REVIEW },
        { new: true }
    );

    ApiResponse.success(application, 'Application moved to Under Review').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'review', id: req.params.id });

    // Notification Logic: Notify the candidate
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

    // Notification Logic: Notify the Employer
    const candidateUser = await User.findById(application.candidate);
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);

    if (employerDoc) {
        const roleLabel = req.user.role === USER_ROLES.ADMIN ? 'Admin' : 'Recruiter';
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'shortlist',
            title: `Candidate Shortlisted by ${roleLabel}`,
            message: `${roleLabel} ${req.user.firstName} ${req.user.lastName} has shortlisted candidate ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job?.title}`,
            jobId: job?._id,
            applicationId: application._id,
            route: `/employer/jobs/${job?._id}/review?appId=${application._id}`
        });
    }
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

    // Notification Logic: Notify the candidate
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
    const existing = await Application.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Application not found');

    // Prevent duplicate shortlist actions
    if (existing.status === APPLICATION_STATUS.RECRUITER_SHORTLISTED) {
        return ApiResponse.success(existing, 'Already shortlisted').send(res);
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.RECRUITER_SHORTLISTED },
        { new: true }
    );

    ApiResponse.success(application, 'Candidate shortlisted and sent to employer').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'shortlist', id: req.params.id });

    // Notification Logic
    const job = await Job.findById(application.job);
    const candidateUser = await User.findById(application.candidate);

    // Notify Employer
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);

    if (employerDoc) {
        const roleLabel = req.user.role === USER_ROLES.ADMIN ? 'Admin' : 'Recruiter';
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'shortlist',
            title: `Candidate Shortlisted by ${roleLabel}`,
            message: `${roleLabel} ${req.user.firstName} ${req.user.lastName} has shortlisted candidate ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/employer/jobs/${job._id}/review?appId=${application._id}`
        });
    }

    // Notify Recruiter (Confirmation)
    createNotification({
        user: req.user.id,
        role: 'recruiter',
        type: 'shortlist',
        title: 'Candidate Shortlisted',
        message: `You have shortlisted ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/recruiter/job/${job._id}/applications`
    });
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

    const isReschedule = application.interviewRounds.some(r => r.roundNumber === parseInt(roundNumber));

    if (isReschedule) {
        // Update existing round
        await Application.updateOne(
            { _id: req.params.id, "interviewRounds.roundNumber": parseInt(roundNumber) },
            {
                $set: {
                    "interviewRounds.$.meetLink": meetLink,
                    "interviewRounds.$.meetCode": meetCode,
                    "interviewRounds.$.scheduledAt": scheduledAt,
                    "interviewRounds.$.createdBy": req.user.id
                }
            }
        );
    } else {
        // Add new round
        application.interviewRounds.push({
            roundNumber,
            meetLink,
            meetCode,
            scheduledAt,
            createdBy: req.user.id
        });
        application.status = APPLICATION_STATUS.INTERVIEW_SCHEDULED;
        await application.save();
    }

    const updatedApp = await Application.findById(req.params.id);
    ApiResponse.success(updatedApp, isReschedule ? 'Interview rescheduled' : 'Interview scheduled').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: isReschedule ? 'reschedule' : 'schedule', id: req.params.id });

    const job = await Job.findById(application.job);
    const candidateUser = await User.findById(application.candidate);
    const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const roleLabel = req.user.role === USER_ROLES.ADMIN ? 'Admin' : 'Recruiter';
    const actionLabel = isReschedule ? 'Rescheduled' : 'Scheduled';
    const actionType = isReschedule ? 'reschedule' : 'interview';

    // 1. Notify Candidate
    createNotification({
        user: application.candidate,
        role: 'candidate',
        type: actionType,
        title: `Interview ${actionLabel}`,
        message: `Interview ${isReschedule ? 'for Round ' + roundNumber + ' has been rescheduled' : 'scheduled for ' + job?.title + ' - Round ' + roundNumber} on ${dateStr} at ${timeStr}`,
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
            type: actionType,
            title: `Interview ${actionLabel} by ${roleLabel}`,
            message: `${roleLabel} ${req.user.firstName} ${req.user.lastName} has ${actionLabel.toLowerCase()} an interview for ${candidateUser?.firstName} ${candidateUser?.lastName}. Round: ${roundNumber}, Date: ${dateStr}, Time: ${timeStr}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/employer/jobs/${job._id}/review?appId=${application._id}`
        });
    }

    // 3. Cross-Role Notification (Admin <-> Recruiter)
    if (req.user.role === USER_ROLES.ADMIN) {
        // Admin scheduled -> Notify Recruiter
        notifyJobRecruiters(job._id, {
            type: actionType,
            title: `Admin ${actionLabel} Interview`,
            message: `Admin ${req.user.firstName} ${req.user.lastName} has ${actionLabel.toLowerCase()} Round ${roundNumber} for ${candidateUser?.firstName} ${candidateUser?.lastName} on ${dateStr} at ${timeStr}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/recruiter/job/${job._id}/applications`
        });
    } else if (req.user.role === USER_ROLES.RECRUITER) {
        // Recruiter scheduled -> Notify Admin
        notifyAdmins({
            type: actionType,
            title: `Recruiter ${actionLabel} Interview`,
            message: `Recruiter ${req.user.firstName} ${req.user.lastName} has ${actionLabel.toLowerCase()} Round ${roundNumber} for ${candidateUser?.firstName} ${candidateUser?.lastName} on ${dateStr} at ${timeStr}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/applications?jobId=${job._id}`
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

    // 1. Notify Candidate
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

    // 2. Notify Employer
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);
    if (employerDoc) {
        const roleLabel = req.user.role === USER_ROLES.ADMIN ? 'Admin' : 'Recruiter';
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'hire',
            title: `Candidate Selected for Hire by ${roleLabel}`,
            message: `${roleLabel} ${req.user.firstName} ${req.user.lastName} has finalized ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/employer/jobs/${job._id}/review?appId=${application._id}`
        });
    }

    // 3. Cross-Role Notification (Admin <-> Recruiter)
    if (req.user.role === USER_ROLES.RECRUITER) {
        // Recruiter hired -> Notify Admin
        notifyAdmins({
            type: 'hire',
            title: 'Candidate Hired by Recruiter',
            message: `Recruiter ${req.user.firstName} ${req.user.lastName} has hired ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/shortlisted-candidates`
        });
    } else if (req.user.role === USER_ROLES.ADMIN) {
        // Admin hired -> Notify Recruiter
        notifyJobRecruiters(job._id, {
            type: 'hire',
            title: 'Candidate Hired by Admin',
            message: `Admin ${req.user.firstName} ${req.user.lastName} has hired ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/recruiter/job/${job._id}/applications`
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

    // 2. Notify Employer
    const EmployerModel = (await import('../models/Employer.model.js')).default;
    const employerDoc = await EmployerModel.findById(job.companyId);
    if (employerDoc) {
        const roleLabel = req.user.role === USER_ROLES.ADMIN ? 'Admin' : 'Recruiter';
        createNotification({
            user: employerDoc.userId,
            role: 'employer',
            type: 'rejection',
            title: `Candidate Rejected by ${roleLabel}`,
            message: `${roleLabel} ${req.user.firstName} ${req.user.lastName} has rejected ${candidateUser?.firstName} ${candidateUser?.lastName} for ${job.title}`,
            jobId: job._id,
            applicationId: application._id,
            route: `/employer/jobs/${job._id}/review?appId=${application._id}`
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
            select: 'firstName lastName email avatar phone skills',
        })
        .populate({
            path: 'candidateProfile',
            select: 'summary skills experience education city state country resumeUrl phone'
        })
        .populate({
            path: 'job',
            select: 'title location city state country salaryMin salaryMax currency'
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
    const existing = await Application.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Application not found');

    // Prevent duplicate approve actions
    if (existing.status === APPLICATION_STATUS.EMPLOYER_SHORTLISTED) {
        return ApiResponse.success(existing, 'Already approved').send(res);
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.EMPLOYER_SHORTLISTED },
        { new: true }
    );

    ApiResponse.success(application, 'Candidate approved by employer').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'employer-approve', id: req.params.id });

    // Notification Logic: Notify Candidate & Recruiter
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
    const existing = await Application.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Application not found');

    // Prevent duplicate reject actions
    if (existing.status === APPLICATION_STATUS.EMPLOYER_REJECTED) {
        return ApiResponse.success(existing, 'Already rejected').send(res);
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.EMPLOYER_REJECTED },
        { new: true }
    );

    ApiResponse.success(application, 'Candidate rejected by employer').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'application', action: 'employer-reject', id: req.params.id });

    // Notification Logic: Notify Candidate & Recruiter
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
    const existing = await Application.findById(req.params.id);
    if (!existing) throw ApiError.notFound('Application not found');

    // Prevent duplicate hire actions
    if (existing.status === APPLICATION_STATUS.FINAL_SELECTED) {
        return ApiResponse.success(existing, 'Already hired').send(res);
    }

    const application = await Application.findByIdAndUpdate(
        req.params.id,
        { status: APPLICATION_STATUS.FINAL_SELECTED },
        { new: true }
    );

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

    // 3. Notify Admin
    notifyAdmins({
        type: 'hire',
        title: 'Candidate Hired',
        message: `${candidateUser?.firstName} ${candidateUser?.lastName} has been hired by Employer ${employerUser?.firstName} ${employerUser?.lastName} for ${job?.title}`,
        jobId: job._id,
        applicationId: application._id,
        route: `/shortlisted-candidates`
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
            populate: { path: 'candidateProfile', select: 'resumeUrl summary skills experience education city state country' }
        })
        .populate('candidateProfile');

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
            pipeline[APPLICATION_STATUS.FINAL_REJECTED].push(app);
        }
    });

    ApiResponse.success({ pipeline, jobTitle: job.title }, 'Job pipeline retrieved').send(res);
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
        pagination: paginationMeta(total, page, limit)
    }, 'All applications retrieved').send(res);
});
