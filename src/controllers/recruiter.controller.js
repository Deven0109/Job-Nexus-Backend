import User from '../models/User.model.js';
import Job from '../models/Job.model.js';
import Application from '../models/Application.model.js';
import Candidate from '../models/Candidate.model.js';
import JobRequest from '../models/JobRequest.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta, buildSort } from '../utils/helpers.js';
import { USER_ROLES, APPLICATION_STATUS } from '../utils/constants.js';

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
    if (req.body.categories !== undefined) user.categories = req.body.categories;

    await user.save({ validateBeforeSave: true });

    ApiResponse.success(
        { profile: user.getPublicProfile() },
        'Profile updated successfully'
    ).send(res);
});

// ==================== CATEGORY & JOB TITLE MANAGEMENT ====================

/**
 * @desc    Get recruiter's managed categories and job titles
 * @route   GET /api/recruiter/categories
 * @access  Private/Recruiter
 */
export const getMyCategories = asyncHandler(async (req, res) => {
    const categories = await RecruiterCategory.find({ recruiterId: req.user.id });
    ApiResponse.success({ categories }, 'Categories retrieved').send(res);
});

/**
 * @desc    Add a category with job titles
 * @route   POST /api/recruiter/categories
 * @access  Private/Recruiter
 */
export const addMyCategory = asyncHandler(async (req, res) => {
    const { categoryName, selectedJobTitles } = req.body;

    if (!categoryName || !selectedJobTitles || selectedJobTitles.length === 0) {
        throw ApiError.badRequest('Category name and at least one job title are required');
    }

    const existing = await RecruiterCategory.findOne({ recruiterId: req.user.id, categoryName });
    if (existing) {
        throw ApiError.badRequest(`You have already added mapping for category: ${categoryName}`);
    }

    const newCategory = await RecruiterCategory.create({
        recruiterId: req.user.id,
        categoryName,
        selectedJobTitles
    });

    ApiResponse.created({ category: newCategory }, 'Category mapping added').send(res);
});

/**
 * @desc    Update a managed category
 * @route   PUT /api/recruiter/categories/:id
 * @access  Private/Recruiter
 */
export const updateMyCategory = asyncHandler(async (req, res) => {
    const { selectedJobTitles } = req.body;

    if (!selectedJobTitles || selectedJobTitles.length === 0) {
        throw ApiError.badRequest('At least one job title is required');
    }

    const category = await RecruiterCategory.findOneAndUpdate(
        { _id: req.params.id, recruiterId: req.user.id },
        { selectedJobTitles },
        { new: true, runValidators: true }
    );

    if (!category) {
        throw ApiError.notFound('Category mapping not found or unauthorized');
    }

    ApiResponse.success({ category }, 'Category mapping updated').send(res);
});

/**
 * @desc    Delete a managed category
 * @route   DELETE /api/recruiter/categories/:id
 * @access  Private/Recruiter
 */
export const deleteMyCategory = asyncHandler(async (req, res) => {
    const category = await RecruiterCategory.findOneAndDelete({ _id: req.params.id, recruiterId: req.user.id });

    if (!category) {
        throw ApiError.notFound('Category mapping not found or unauthorized');
    }

    ApiResponse.success(null, 'Category mapping deleted').send(res);
});

// ==================== GET DASHBOARD STATS ====================

const getJobFilterForRecruiter = async (recruiterId) => {
    try {
        const categories = await RecruiterCategory.find({ recruiterId }).lean();
        const orConditions = (categories || [])
            .filter(cat => cat.categoryName && Array.isArray(cat.selectedJobTitles))
            .map(cat => ({
                category: cat.categoryName,
                title: { $in: cat.selectedJobTitles }
            }));

        if (orConditions.length === 0) {
            return { createdByRecruiter: recruiterId };
        }

        return {
            $or: [
                { createdByRecruiter: recruiterId },
                ...orConditions
            ]
        };
    } catch (error) {
        console.error('Error in getJobFilterForRecruiter:', error);
        return { createdByRecruiter: recruiterId };
    }
};

const SHORTLISTED_STATUSES = [
    APPLICATION_STATUS.RECRUITER_SHORTLISTED,
    APPLICATION_STATUS.EMPLOYER_SHORTLISTED,
    APPLICATION_STATUS.INTERVIEW_SCHEDULED,
    APPLICATION_STATUS.INTERVIEW_COMPLETED,
    APPLICATION_STATUS.SELECTED_NEXT_ROUND,
    APPLICATION_STATUS.FINAL_SELECTED
];

/**
 * @desc    Get recruiter dashboard overview
 * @route   GET /api/recruiter/dashboard
 * @access  Private/Recruiter
 */
export const getDashboard = asyncHandler(async (req, res) => {
    // Fetch jobs for this recruiter's categories
    const jobFilter = await getJobFilterForRecruiter(req.user.id);
    const myJobs = await Job.find(jobFilter, '_id createdAt status').lean();
    const myJobIds = myJobs.map(job => job._id);

    // If no jobs found, return early with zeros
    if (myJobs.length === 0) {
        return ApiResponse.success({
            stats: {
                totalJobs: 0,
                activeJobs: 0,
                totalApplications: 0,
                shortlistedCount: 0,
                jobDates: [],
                applicationDates: [],
                recentActivity: []
            }
        }, 'Dashboard data retrieved (Empty)').send(res);
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [totalApplications, shortlistedCount, recentApps, applicationDatesRaw] = await Promise.all([
        Application.countDocuments({ job: { $in: myJobIds } }),
        Application.countDocuments({ 
            job: { $in: myJobIds }, 
            status: { $in: SHORTLISTED_STATUSES } 
        }),
        Application.find({ job: { $in: myJobIds } })
            .populate('job', 'title')
            .populate('candidate', 'firstName lastName avatar')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
        Application.find(
            { 
                job: { $in: myJobIds },
                createdAt: { $gt: twelveMonthsAgo }
            }, 
            'createdAt'
        ).lean()
    ]);

    const activeJobs = (myJobs || []).filter(job => job.status === 'active').length;

    const recentActivity = (recentApps || []).map(app => ({
        id: app._id,
        candidateName: `${app.candidate?.firstName || 'Unknown'} ${app.candidate?.lastName || ''}`,
        jobTitle: app.job?.title || 'Unknown Job',
        jobId: app.job?._id,
        action: `applied for ${app.job?.title || 'job'}`,
        avatar: app.candidate?.avatar,
        time: app.createdAt || new Date()
    }));

    const stats = {
        totalJobs: (myJobs || []).length,
        activeJobs,
        totalApplications: totalApplications || 0,
        shortlistedCount: shortlistedCount || 0,
        jobDates: (myJobs || []).map(j => j.createdAt).filter(Boolean),
        applicationDates: (applicationDatesRaw || []).map(a => a.createdAt).filter(Boolean),
        recentActivity
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
        currency: req.body.currency || 'INR',
        workType: req.body.workType,
        urgency: req.body.urgency,
        requiredSkills: req.body.requiredSkills,
        description: req.body.description,
        companyId: req.body.companyId || req.body.employer, // Fallback if old code passed employer
        createdByRecruiter: req.user.id,
        status: 'active',
        visibility: 'public',
        jobRequestId: req.body.jobRequestId
    };

    // Recruiter validation for manual job creation (if not from request)
    if (!jobData.jobRequestId) {
        const categoryMapping = await RecruiterCategory.findOne({ recruiterId: req.user.id, categoryName: jobData.category });
        if (!categoryMapping || !categoryMapping.selectedJobTitles.includes(jobData.title)) {
            throw ApiError.forbidden('You do not manage this job category and title combination');
        }
    }

    const job = await Job.create(jobData);

    // If this job originated from a job request, mark it as Activated
    if (jobData.jobRequestId) {
        await JobRequest.findByIdAndUpdate(
            jobData.jobRequestId,
            { status: 'active', jobId: job._id }
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
    const filter = await getJobFilterForRecruiter(req.user.id);

    if (req.query.status) {
        filter.status = req.query.status;
    }

    let finalFilter = filter;

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        finalFilter = {
            $and: [
                filter,
                {
                    $or: [
                        { title: searchRegex },
                        { city: searchRegex },
                        { location: searchRegex },
                        { state: searchRegex }
                    ]
                }
            ]
        };
    }

    const sortOrder = req.query.sortBy === 'oldest' ? 1 : -1;

    const [jobsRaw, total] = await Promise.all([
        Job.find(finalFilter)
            .sort({ createdAt: sortOrder })
            .skip(skip)
            .limit(limit)
            .populate('companyId', 'companyName companyEmail')
            .lean(),
        Job.countDocuments(finalFilter)
    ]);

    const jobs = await Promise.all(
        jobsRaw.map(async (job) => {
            const applicationCount = await Application.countDocuments({ job: job._id });
            return {
                ...job,
                applicationCount
            };
        })
    );

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
    const filter = await getJobFilterForRecruiter(req.user.id);
    filter._id = req.params.id;

    const job = await Job.findOneAndUpdate(
        filter,
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
    const filter = await getJobFilterForRecruiter(req.user.id);
    filter._id = req.params.id;

    const job = await Job.findOneAndDelete(filter);

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
    const filter = await getJobFilterForRecruiter(req.user.id);
    filter._id = req.params.id;

    const job = await Job.findOne(filter);

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
