import Job from '../models/Job.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';

/**
 * @desc    Get all public jobs with filters
 * @route   GET /api/jobs
 * @access  Public
 */
export const getJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const filter = { status: 'active', visibility: 'public' };

    // Handle explicit search or params
    if (req.query.title) {
        filter.title = new RegExp(req.query.title, 'i');
    }

    if (req.query.location) {
        filter.location = new RegExp(req.query.location, 'i');
    }

    if (req.query.states) {
        const statesList = req.query.states.split(',').map(s => s.trim());
        if (filter.location) {
            // we already have a location (country/city), let's use an $and
            filter.$and = [
                { location: filter.location },
                { location: new RegExp(statesList.join('|'), 'i') }
            ];
            delete filter.location;
        } else {
            filter.location = new RegExp(statesList.join('|'), 'i');
        }
    }

    if (req.query.categories) {
        const cats = req.query.categories.split(',').map(c => c.trim());
        filter.category = { $in: cats };
    }

    if (req.query.skills) {
        const skillsList = req.query.skills.split(',').map(s => s.trim());
        filter.requiredSkills = { $in: skillsList.map(s => new RegExp(`^${s}$`, 'i')) };
    }

    if (req.query.experience) {
        const exps = req.query.experience.split(',').map(e => e.trim());
        const expRegexes = exps.map(e => new RegExp(e.replace('+', '\\+'), 'i'));
        filter.experience = { $in: expRegexes };
    }

    if (req.query.salaryMin || req.query.salaryMax) {
        filter.salaryMax = {};
        filter.salaryMin = {};

        if (req.query.salaryMin) {
            filter.salaryMax.$gte = Number(req.query.salaryMin);
        }

        if (req.query.salaryMax) {
            filter.salaryMin.$lte = Number(req.query.salaryMax);
        }

        if (Object.keys(filter.salaryMax).length === 0) delete filter.salaryMax;
        if (Object.keys(filter.salaryMin).length === 0) delete filter.salaryMin;
    }

    if (req.query.workType) filter.workType = req.query.workType;

    const [jobs, total] = await Promise.all([
        Job.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('companyId', 'companyName logo industry companyLocation'),
        Job.countDocuments(filter)
    ]);

    ApiResponse.success(
        {
            jobs,
            pagination: paginationMeta(total, page, limit)
        },
        'Jobs retrieved successfully'
    ).send(res);
});

/**
 * @desc    Get single job by ID
 * @route   GET /api/jobs/:id
 * @access  Public
 */
export const getJobById = asyncHandler(async (req, res) => {
    const job = await Job.findById(req.params.id)
        .populate('companyId', 'companyName logo industry companyLocation companyWebsite companyDescription contactPersonName contactPersonEmail')
        .populate('createdByRecruiter', 'firstName lastName');

    if (!job) {
        return ApiResponse.error('Job not found', 404).send(res);
    }

    if (job.status !== 'active' || job.visibility !== 'public') {
        return ApiResponse.error('Job is no longer available', 404).send(res);
    }

    ApiResponse.success({ job }, 'Job details retrieved').send(res);
});
