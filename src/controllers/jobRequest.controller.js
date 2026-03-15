import JobRequest, { JOB_REQUEST_STATUS } from '../models/JobRequest.model.js';
import Employer from '../models/Employer.model.js';
import Job from '../models/Job.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getIO } from '../socket.js';

const checkRecruiterAuth = async (recruiterId, jobCategory, jobTitle) => {
    if (!jobCategory || !jobTitle) return false;

    // Find mapping with case-insensitive category name
    const categoryMapping = await RecruiterCategory.findOne({
        recruiterId,
        categoryName: { $regex: new RegExp(`^${jobCategory.trim()}$`, 'i') }
    });

    if (!categoryMapping) return false;

    // Case-insensitive and trimmed job title check
    return categoryMapping.selectedJobTitles.some(
        t => t.trim().toLowerCase() === jobTitle.trim().toLowerCase()
    );
};
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';
import { NOTIFICATION_TYPES } from '../utils/constants.js';
import {
    createNotification,
    notifyMatchedRecruiters,
    notifyAllCandidates,
    notifyAdmins
} from '../services/notification.service.js';

// ==================== EMPLOYER: CREATE JOB REQUEST ====================

/**
 * @desc    Employer submits a new job request
 * @route   POST /api/job-requests
 * @access  Private/Employer
 */
export const createJobRequest = asyncHandler(async (req, res) => {
    // Check if employer is verified
    const employer = await Employer.findOne({ userId: req.user.id });

    if (!employer || employer.status !== 'approved' || !employer.verifiedByAdmin) {
        throw ApiError.forbidden('Your company must be approved by admin before submitting job requests');
    }

    const {
        position, jobTitle, jobCategory, numberOfVacancies, experienceRequired,
        salaryMin, salaryMax, workType, country, state, city, pincode,
        requiredSkills, jobDescription, urgency
    } = req.body;

    const jobRequest = await JobRequest.create({
        companyId: employer._id,
        createdByEmployer: req.user.id,
        jobTitle: jobTitle || position,   // model field is 'jobTitle'
        jobCategory,
        numberOfVacancies,
        experienceRequired,
        salaryMin,
        salaryMax,
        workType,
        country,
        state,
        city,
        pincode,
        requiredSkills,
        jobDescription,
        urgency: urgency || 'Medium',
        status: JOB_REQUEST_STATUS.PENDING,
    });

    ApiResponse.created(
        { jobRequest },
        'Job request submitted successfully'
    ).send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'job_request', action: 'create' });

    // Notification Logic: Notify relevant recruiters by category and job title
    notifyMatchedRecruiters(jobRequest.jobCategory, jobRequest.jobTitle, {
        type: 'job_request',
        title: 'New Job Request Received',
        message: `New job request received for ${jobRequest.jobTitle} in ${jobRequest.jobCategory}`,
        jobRequestId: jobRequest._id,
        route: '/recruiter/job-requests'
    });
});

// ==================== EMPLOYER: GET MY JOB REQUESTS ====================

/**
 * @desc    Employer views own job requests
 * @route   GET /api/job-requests/my
 * @access  Private/Employer
 */
export const getMyJobRequests = asyncHandler(async (req, res) => {
    // Override limit to 6 for employer's job requests module pagination
    req.query.limit = req.query.limit || 6;
    const { page, limit, skip } = buildPagination(req.query);

    const filter = { createdByEmployer: req.user.id };

    if (req.query.status) {
        filter.status = req.query.status;
    }

    if (req.query.search) {
        filter.jobTitle = new RegExp(req.query.search, 'i');
    }

    const [jobRequests, total] = await Promise.all([
        JobRequest.find(filter)
            .populate('companyId', 'companyName logo companyEmail')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        JobRequest.countDocuments(filter),
    ]);

    ApiResponse.success(
        {
            jobRequests,
            pagination: paginationMeta(total, page, limit),
        },
        'Job requests retrieved'
    ).send(res);
});

// ==================== EMPLOYER: GET SINGLE JOB REQUEST ====================

/**
 * @desc    Employer views a single job request
 * @route   GET /api/job-requests/my/:id
 * @access  Private/Employer
 */
export const getMyJobRequestById = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findOne({
        _id: req.params.id,
        createdByEmployer: req.user.id
    }).populate('companyId', 'companyName logo companyEmail');

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    ApiResponse.success({ jobRequest }, 'Job request retrieved').send(res);
});

// ==================== EMPLOYER: UPDATE JOB REQUEST ====================

/**
 * @desc    Employer edits a pending job request
 * @route   PUT /api/job-requests/my/:id
 * @access  Private/Employer
 */
export const updateJobRequest = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findOne({
        _id: req.params.id,
        createdByEmployer: req.user.id
    });

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.PENDING) {
        throw ApiError.badRequest('Only pending job requests can be edited');
    }

    const allowedFields = [
        'jobTitle', 'jobCategory', 'numberOfVacancies', 'experienceRequired',
        'salaryMin', 'salaryMax', 'workType', 'country', 'state', 'city', 'pincode',
        'requiredSkills', 'jobDescription', 'urgency'
    ];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            jobRequest[field] = req.body[field];
        }
    });

    // Support legacy 'position' field as alias for jobTitle
    if (req.body.position !== undefined && req.body.jobTitle === undefined) {
        jobRequest.jobTitle = req.body.position;
    }

    await jobRequest.save();

    ApiResponse.success({ jobRequest }, 'Job request updated successfully').send(res);
});


// ==================== EMPLOYER: CANCEL JOB REQUEST ====================

/**
 * @desc    Employer cancels a pending job request
 * @route   DELETE /api/job-requests/my/:id
 * @access  Private/Employer
 */
export const cancelJobRequest = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findOne({
        _id: req.params.id,
        createdByEmployer: req.user.id
    });

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.PENDING) {
        throw ApiError.badRequest('Only pending job requests can be cancelled');
    }

    // Delete request natively
    await JobRequest.deleteOne({ _id: jobRequest._id });

    ApiResponse.success(null, 'Job request cancelled successfully').send(res);
});

import Application from '../models/Application.model.js';

/**
 * @desc    Recruiter or Admin views all job requests
 * @route   GET /api/job-requests
 * @access  Private/Recruiter, Private/Admin
 */
export const listJobRequests = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);

    let filter = {};

    // Recruiters only see requests matching their categories AND job titles
    if (req.user.role === 'recruiter') {
        const categories = await RecruiterCategory.find({ recruiterId: req.user.id });

        if (categories.length === 0) {
            filter._id = null; // No categories mapped, no jobs visible
        } else {
            // Build conditions for each managed category and its job titles
            const orConditions = categories.map(cat => ({
                jobCategory: { $regex: new RegExp(`^${cat.categoryName.trim()}$`, 'i') },
                jobTitle: { $in: cat.selectedJobTitles.map(t => new RegExp(`^${t.trim()}$`, 'i')) }
            }));
            filter.$or = orConditions;
        }
    }
    // Admins see everything

    if (req.query.status) {
        filter.status = req.query.status;
    }

    if (req.query.search) {
        filter.jobTitle = new RegExp(req.query.search, 'i');
    }

    const [jobRequestsRows, total, totalActive, totalOverall] = await Promise.all([
        JobRequest.find(filter)
            .populate('companyId', 'companyName companyEmail industry companyLocation')
            .populate('createdByEmployer', 'firstName lastName email')
            .populate('approvedByRecruiter', 'firstName lastName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        JobRequest.countDocuments(filter),
        JobRequest.countDocuments({ ...filter, status: 'active' }),
        JobRequest.countDocuments({ ...filter, status: { $ne: null } }) // Get total matching current filters but across all pages
    ]);

    // Base filter for the recruiter's permissions (ignoring UI search/status filters)
    let statsFilter = {};
    if (req.user.role === 'recruiter') {
        const categories = await RecruiterCategory.find({ recruiterId: req.user.id });
        if (categories.length === 0) {
            statsFilter._id = null;
        } else {
            const orConditions = categories.map(cat => ({
                jobCategory: { $regex: new RegExp(`^${cat.categoryName.trim()}$`, 'i') },
                jobTitle: { $in: cat.selectedJobTitles.map(t => new RegExp(`^${t.trim()}$`, 'i')) }
            }));
            statsFilter.$or = orConditions;
        }
    }

    // Also get authorized counts (regardless of UI search/filter) for the stats cards
    const [globalActive, globalTotal] = await Promise.all([
        JobRequest.countDocuments({ ...statsFilter, status: 'active' }),
        JobRequest.countDocuments(statsFilter)
    ]);

    // Enhance with application counts
    const jobRequests = await Promise.all(jobRequestsRows.map(async (jr) => {
        const obj = jr.toObject();
        if (obj.jobId) {
            obj.applicantCount = await Application.countDocuments({ job: obj.jobId });
        } else {
            obj.applicantCount = 0;
        }
        return obj;
    }));

    ApiResponse.success(
        {
            jobRequests,
            pagination: paginationMeta(total, page, limit),
            stats: {
                totalActive: globalActive,
                totalOverall: globalTotal
            }
        },
        'Job requests retrieved'
    ).send(res);
});

// ==================== RECRUITER/ADMIN: GET SINGLE JOB REQUEST ====================

/**
 * @desc    Recruiter or Admin views a single job request detail
 * @route   GET /api/job-requests/:id
 * @access  Private/Recruiter, Private/Admin
 */
export const getJobRequestById = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id)
        .populate('companyId', 'companyName companyEmail industry companyLocation companyDescription')
        .populate('createdByEmployer', 'firstName lastName email phone')
        .populate('approvedByRecruiter', 'firstName lastName email');

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    ApiResponse.success({ jobRequest }, 'Job request retrieved').send(res);
});

// ==================== RECRUITER/ADMIN: EDIT JOB REQUEST ====================

/**
 * @desc    Recruiter or Admin edits a job request
 * @route   PUT /api/job-requests/:id
 * @access  Private/Recruiter, Private/Admin
 */
export const updateJobRequestByAdminRecruiter = asyncHandler(async (req, res, next) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (req.user.role === 'recruiter') {
        const isAuth = await checkRecruiterAuth(req.user.id, jobRequest.jobCategory, jobRequest.jobTitle);
        if (!isAuth) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    // Capture editing recruiter
    if (req.user.role === 'recruiter') {
        jobRequest.approvedByRecruiter = req.user.id;
    }

    const allowedFields = [
        'jobTitle', 'jobCategory', 'numberOfVacancies', 'experienceRequired',
        'salaryMin', 'salaryMax', 'workType', 'country', 'state', 'city', 'pincode',
        'requiredSkills', 'jobDescription', 'urgency'
    ];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            jobRequest[field] = req.body[field];
        }
    });

    // Also accept legacy 'position' field as alias for jobTitle
    if (req.body.position !== undefined && req.body.jobTitle === undefined) {
        jobRequest.jobTitle = req.body.position;
    }

    await jobRequest.save();

    // If the request is already active, sync the changes to the live Job document
    if (jobRequest.status === 'active') {
        const liveJob = await Job.findOne({ jobRequestId: jobRequest._id });
        if (liveJob) {
            const incomingTitle = req.body.jobTitle || req.body.position;
            if (incomingTitle !== undefined) liveJob.title = incomingTitle;
            if (req.body.jobCategory !== undefined) liveJob.category = req.body.jobCategory;
            if (req.body.numberOfVacancies !== undefined) liveJob.vacancies = req.body.numberOfVacancies;
            if (req.body.experienceRequired !== undefined) liveJob.experience = req.body.experienceRequired;
            if (req.body.salaryMin !== undefined) liveJob.salaryMin = req.body.salaryMin;
            if (req.body.salaryMax !== undefined) liveJob.salaryMax = req.body.salaryMax;
            if (req.body.workType !== undefined) liveJob.workType = req.body.workType;
            if (req.body.country !== undefined) liveJob.country = req.body.country;
            if (req.body.state !== undefined) liveJob.state = req.body.state;
            if (req.body.city !== undefined) liveJob.city = req.body.city;
            if (req.body.pincode !== undefined) liveJob.pincode = req.body.pincode;
            if (req.body.requiredSkills !== undefined) liveJob.requiredSkills = req.body.requiredSkills;
            if (req.body.jobDescription !== undefined) liveJob.description = req.body.jobDescription;
            if (req.body.urgency !== undefined) liveJob.urgency = req.body.urgency;
            await liveJob.save();
        }
    }

    ApiResponse.success({ jobRequest }, 'Job request updated successfully').send(res);
});

// ==================== RECRUITER: APPROVE JOB REQUEST ====================

/**
 * @desc    Recruiter reviews and approves job request
 * @route   PATCH /api/job-requests/:id/approve
 * @access  Private/Recruiter
 */
export const approveJobRequest = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.PENDING) {
        throw ApiError.badRequest('Only pending requests can be approved');
    }

    if (req.user.role === 'recruiter') {
        const isAuth = await checkRecruiterAuth(req.user.id, jobRequest.jobCategory, jobRequest.jobTitle);
        if (!isAuth) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    jobRequest.status = JOB_REQUEST_STATUS.APPROVED;
    jobRequest.approvedByRecruiter = req.user.id;
    await jobRequest.save();

    ApiResponse.success({ jobRequest }, 'Job request approved. Ready for activation.').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'job_request', action: 'approve', id: jobRequest._id });

    // Notification Logic: Notify the specific employer
    createNotification({
        user: jobRequest.createdByEmployer,
        role: 'employer',
        type: 'job_request_approved',
        title: 'Job Request Approved',
        message: `Your job request for ${jobRequest.jobTitle} has been approved.`,
        jobRequestId: jobRequest._id,
        route: '/employer/job-requests'
    });
});

// ==================== RECRUITER: REJECT JOB REQUEST ====================

/**
 * @desc    Recruiter rejects a pending job request
 * @route   PATCH /api/job-requests/:id/reject
 * @access  Private/Recruiter
 */
export const rejectJobRequest = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.PENDING) {
        throw ApiError.badRequest('Only pending requests can be rejected');
    }

    if (req.user.role === 'recruiter') {
        const isAuth = await checkRecruiterAuth(req.user.id, jobRequest.jobCategory, jobRequest.jobTitle);
        if (!isAuth) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    jobRequest.status = JOB_REQUEST_STATUS.REJECTED;
    await jobRequest.save();

    ApiResponse.success({ jobRequest }, 'Job request rejected').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'job_request', action: 'reject', id: jobRequest._id });

    // Notification Logic: Notify the specific employer
    createNotification({
        user: jobRequest.createdByEmployer,
        role: 'employer',
        type: 'rejection',
        title: 'Job Request Rejected',
        message: `Your job request for ${jobRequest.jobTitle} has been rejected`,
        jobRequestId: jobRequest._id,
        route: '/employer/job-requests'
    });
});

// ==================== RECRUITER: ACTIVATE JOB ====================

/**
 * @desc    Recruiter activates an approved requested job to make public
 * @route   POST /api/job-requests/:id/activate
 * @access  Private/Recruiter
 */
export const activateJob = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.APPROVED) {
        throw ApiError.badRequest('Only approved requests can be activated');
    }

    if (req.user.role === 'recruiter') {
        const isAuth = await checkRecruiterAuth(req.user.id, jobRequest.jobCategory, jobRequest.jobTitle);
        if (!isAuth) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    // Auto-create the actual Job
    const newJob = await Job.create({
        title: jobRequest.jobTitle,           // Job model uses 'title'
        category: jobRequest.jobCategory,
        vacancies: jobRequest.numberOfVacancies,
        experience: jobRequest.experienceRequired,
        country: jobRequest.country,
        state: jobRequest.state,
        city: jobRequest.city,
        pincode: jobRequest.pincode,
        salaryMin: jobRequest.salaryMin,
        salaryMax: jobRequest.salaryMax,
        workType: jobRequest.workType,
        urgency: jobRequest.urgency,
        requiredSkills: jobRequest.requiredSkills,
        description: jobRequest.jobDescription,
        companyId: jobRequest.companyId,
        createdByRecruiter: req.user.id,
        status: 'active',
        visibility: 'public',
        jobRequestId: jobRequest._id
    });

    jobRequest.status = JOB_REQUEST_STATUS.ACTIVE;
    jobRequest.jobId = newJob._id;
    await jobRequest.save();

    ApiResponse.success({ jobRequest, job: newJob }, 'Job requested activated successfully').send(res);

    // Global Data Sync
    getIO()?.emit('data:updated', { type: 'job_request', action: 'activate', id: jobRequest._id });

    // Notification Logic: Notify all candidates
    notifyAllCandidates({
        type: 'job_activated',
        title: 'New Active Job',
        message: `A new job is now active: ${newJob.title}`,
        jobId: newJob._id,
        route: '/jobs'
    });

    // Notification Logic: Notify Admin
    try {
        await notifyAdmins({
            type: NOTIFICATION_TYPES.NEW_ACTIVE_JOB,
            title: 'New active job',
            message: `A new job "${newJob.title}" has been activated by ${req.user.firstName} ${req.user.lastName}`,
            jobId: newJob._id,
            route: `/jobs?search=${newJob.title}`
        });
    } catch (notifyErr) {
        console.error('Admin job activation notification failed:', notifyErr);
    }
});

// ==================== RECRUITER/ADMIN: TOGGLE JOB STATUS ====================

/**
 * @desc    Toggle job between active and inactive
 * @route   PATCH /api/job-requests/:id/toggle-status
 * @access  Private/Recruiter, Private/Admin
 */
export const toggleJobStatus = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
    }

    if (jobRequest.status !== JOB_REQUEST_STATUS.ACTIVE && jobRequest.status !== JOB_REQUEST_STATUS.INACTIVE) {
        throw ApiError.badRequest('Only activated jobs can have their status toggled');
    }

    if (req.user.role === 'recruiter') {
        const isAuth = await checkRecruiterAuth(req.user.id, jobRequest.jobCategory, jobRequest.jobTitle);
        if (!isAuth) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    // Toggle status
    const newStatus = jobRequest.status === JOB_REQUEST_STATUS.ACTIVE
        ? JOB_REQUEST_STATUS.INACTIVE
        : JOB_REQUEST_STATUS.ACTIVE;

    jobRequest.status = newStatus;
    await jobRequest.save();

    // Also update the linked Job document
    if (jobRequest.jobId) {
        await Job.findByIdAndUpdate(jobRequest.jobId, {
            status: newStatus === JOB_REQUEST_STATUS.ACTIVE ? 'active' : 'inactive'
        });
    }

    ApiResponse.success(
        { status: jobRequest.status },
        `Job converted to ${jobRequest.status} successfully`
    ).send(res);
});
