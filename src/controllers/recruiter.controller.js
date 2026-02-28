import User from '../models/User.model.js';
import Job from '../models/Job.model.js';
import Application from '../models/Application.model.js';
import Candidate from '../models/Candidate.model.js';
import JobRequest from '../models/JobRequest.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta, buildSort } from '../utils/helpers.js';
import { USER_ROLES } from '../utils/constants.js';

// ==================== GET PROFILE ====================

/**
 * @desc    Get recruiter's own profile
 * @route   GET /api/recruiter/profile
 * @access  Private/Recruiter
 */
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    ApiResponse.success(
        { profile: user.getPublicProfile() },
        'Profile retrieved'
    ).send(res);
});

// ==================== UPDATE PROFILE ====================

/**
 * @desc    Update recruiter's own profile
 * @route   PUT /api/recruiter/profile
 * @access  Private/Recruiter
 */
export const updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, avatar } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save({ validateBeforeSave: true });

    ApiResponse.success(
        { profile: user.getPublicProfile() },
        'Profile updated successfully'
    ).send(res);
});

// ==================== GET DASHBOARD STATS ====================

/**
 * @desc    Get recruiter dashboard overview
 * @route   GET /api/recruiter/dashboard
 * @access  Private/Recruiter
 */
export const getDashboard = asyncHandler(async (req, res) => {
    const [activeJobs, totalCandidates, pendingOffers, pipelineStats] = await Promise.all([
        Job.countDocuments({ createdByRecruiter: req.user.id, status: 'active' }),
        User.countDocuments({ role: USER_ROLES.CANDIDATE, isActive: true }),
        Application.countDocuments({ status: 'offered' }),
        Application.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
    ]);

    const pipelineSummary = {
        applied: 0,
        screening: 0,
        shortlisted: 0,
        interviewing: 0,
        offered: 0,
        hired: 0,
    };

    pipelineStats.forEach(stat => {
        if (pipelineSummary.hasOwnProperty(stat._id)) {
            pipelineSummary[stat._id] = stat.count;
        }
    });

    const stats = {
        activeJobs,
        totalCandidates,
        interviewsToday: 0, // Placeholder for interview module
        pendingOffers,
        pipelineSummary
    };

    ApiResponse.success({ stats }, 'Dashboard data retrieved').send(res);
});

// ==================== JOB MANAGEMENT ====================

/**
 * @desc    Create a new job posting
 * @route   POST /api/recruiter/jobs
 * @access  Private/Recruiter
 */
export const createJob = asyncHandler(async (req, res) => {
    const jobData = {
        title: req.body.title,
        category: req.body.category,
        vacancies: req.body.vacancies,
        experience: req.body.experience,
        location: req.body.location,
        salaryMin: req.body.salaryMin,
        salaryMax: req.body.salaryMax,
        workType: req.body.workType,
        urgency: req.body.urgency,
        requiredSkills: req.body.requiredSkills,
        description: req.body.description,
        companyId: req.body.companyId || req.body.employer, // Fallback if old code passed employer
        createdByRecruiter: req.user.id,
        status: 'active',
        visibility: 'public'
    };

    const job = await Job.create(jobData);

    // If this job originated from a job request, mark it as Activated
    if (jobData.jobRequestId) {
        await JobRequest.findByIdAndUpdate(
            jobData.jobRequestId,
            { status: 'activated', jobId: job._id }
        );
    }

    ApiResponse.created({ job }, 'Job created successfully').send(res);
});

/**
 * @desc    Get all jobs managed by recruiter
 * @route   GET /api/recruiter/jobs
 * @access  Private/Recruiter
 */
export const getMyJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const filter = { createdByRecruiter: req.user.id };

    if (req.query.status) {
        filter.status = req.query.status;
    }

    const [jobs, total] = await Promise.all([
        Job.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('companyId', 'companyName companyEmail'),
        Job.countDocuments(filter)
    ]);

    ApiResponse.success(
        {
            jobs,
            pagination: paginationMeta(total, page, limit)
        },
        'My jobs retrieved'
    ).send(res);
});

/**
 * @desc    Update a job posting
 * @route   PUT /api/recruiter/jobs/:id
 * @access  Private/Recruiter
 */
export const updateJob = asyncHandler(async (req, res) => {
    const job = await Job.findOneAndUpdate(
        { _id: req.params.id, createdByRecruiter: req.user.id },
        req.body,
        { new: true, runValidators: true }
    );

    if (!job) {
        throw ApiError.notFound('Job not found or unauthorized');
    }

    ApiResponse.success({ job }, 'Job updated successfully').send(res);
});

/**
 * @desc    Delete a job posting
 * @route   DELETE /api/recruiter/jobs/:id
 * @access  Private/Recruiter
 */
export const deleteJob = asyncHandler(async (req, res) => {
    const job = await Job.findOneAndDelete({ _id: req.params.id, createdByRecruiter: req.user.id });

    if (!job) {
        throw ApiError.notFound('Job not found or unauthorized');
    }

    ApiResponse.success(null, 'Job deleted successfully').send(res);
});

/**
 * @desc    Toggle job status (active/inactive)
 * @route   PATCH /api/recruiter/jobs/:id/toggle-status
 * @access  Private/Recruiter
 */
export const toggleJobStatus = asyncHandler(async (req, res) => {
    const job = await Job.findOne({ _id: req.params.id, createdByRecruiter: req.user.id });

    if (!job) {
        throw ApiError.notFound('Job not found or unauthorized');
    }

    job.status = job.status === 'active' ? 'inactive' : 'active';
    await job.save();

    // If it's linked to a JobRequest, update that too
    if (job.jobRequestId) {
        await JobRequest.findByIdAndUpdate(job.jobRequestId, { status: job.status });
    }

    ApiResponse.success({ status: job.status }, `Job ${job.status} successfully`).send(res);
});

// ==================== LIST CANDIDATES ====================

/**
 * @desc    Get list of candidates (for recruiter's pipeline)
 * @route   GET /api/recruiter/candidates
 * @access  Private/Recruiter
 */
export const listCandidates = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);

    const filter = { role: USER_ROLES.CANDIDATE, isActive: true };

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
        ];
    }

    const [candidates, total] = await Promise.all([
        User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('firstName lastName email phone avatar createdAt'),
        User.countDocuments(filter),
    ]);

    ApiResponse.success(
        {
            candidates,
            pagination: paginationMeta(total, page, limit),
        },
        'Candidates retrieved'
    ).send(res);
});
