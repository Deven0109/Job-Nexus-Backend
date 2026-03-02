import JobRequest, { JOB_REQUEST_STATUS } from '../models/JobRequest.model.js';
import Employer from '../models/Employer.model.js';
import Job from '../models/Job.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';

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
        jobTitle, jobCategory, numberOfVacancies, experienceRequired,
        salaryMin, salaryMax, workType, country, state, city, pincode,
        requiredSkills, jobDescription, urgency
    } = req.body;

    const jobRequest = await JobRequest.create({
        companyId: employer._id,
        createdByEmployer: req.user.id,
        jobTitle,
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
});

// ==================== EMPLOYER: GET MY JOB REQUESTS ====================

/**
 * @desc    Employer views own job requests
 * @route   GET /api/job-requests/my
 * @access  Private/Employer
 */
export const getMyJobRequests = asyncHandler(async (req, res) => {
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

// ==================== RECRUITER/ADMIN: LIST ALL JOB REQUESTS ====================

/**
 * @desc    Recruiter or Admin views all job requests
 * @route   GET /api/job-requests
 * @access  Private/Recruiter, Private/Admin
 */
export const listJobRequests = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);

    let filter = {};

    // Recruiters only see requests from verified employers
    if (req.user.role === 'recruiter') {
        const verifiedEmployers = await Employer.find({ verifiedByAdmin: true, status: 'approved' }).select('_id');
        const verifiedEmployerIds = verifiedEmployers.map(e => e._id);
        filter.companyId = { $in: verifiedEmployerIds };
    }
    // Admins see everything

    if (req.query.status) {
        filter.status = req.query.status;
    }

    if (req.query.search) {
        filter.jobTitle = new RegExp(req.query.search, 'i');
    }

    const [jobRequests, total] = await Promise.all([
        JobRequest.find(filter)
            .populate('companyId', 'companyName companyEmail industry companyLocation')
            .populate('createdByEmployer', 'firstName lastName email')
            .populate('approvedByRecruiter', 'firstName lastName')
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
export const updateJobRequestByAdminRecruiter = asyncHandler(async (req, res) => {
    const jobRequest = await JobRequest.findById(req.params.id);

    if (!jobRequest) {
        throw ApiError.notFound('Job request not found');
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

    await jobRequest.save();

    // If the request is already active, sync the changes to the live Job document
    if (jobRequest.status === 'active') {
        const liveJob = await Job.findOne({ jobRequestId: jobRequest._id });
        if (liveJob) {
            if (req.body.jobTitle !== undefined) liveJob.title = req.body.jobTitle;
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

    jobRequest.status = JOB_REQUEST_STATUS.APPROVED;
    jobRequest.approvedByRecruiter = req.user.id;
    await jobRequest.save();

    ApiResponse.success({ jobRequest }, 'Job request approved. Ready for activation.').send(res);
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

    jobRequest.status = JOB_REQUEST_STATUS.REJECTED;
    await jobRequest.save();

    ApiResponse.success({ jobRequest }, 'Job request rejected').send(res);
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

    // Auto-create the actual Job
    const newJob = await Job.create({
        title: jobRequest.jobTitle,
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
