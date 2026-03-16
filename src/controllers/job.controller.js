import Job from '../models/Job.model.js';
import User from '../models/User.model.js';
import Application from '../models/Application.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';
import { masterCategories } from '../utils/categoriesList.js';


/**
 * @desc    Get all public jobs with filters
 * @route   GET /api/jobs
 * @access  Public
 */
export const getJobs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const filter = { status: 'active', visibility: 'public' };
    const andClauses = [];

    // Handle explicit search or params
    if (req.query.title) {
        const titleRegex = new RegExp(req.query.title, 'i');
        andClauses.push({
            $or: [
                { title: titleRegex },
                { category: titleRegex },
                { requiredSkills: titleRegex }
            ]
        });
    }

    if (req.query.location) {
        const locRegex = new RegExp(req.query.location, 'i');
        andClauses.push({
            $or: [
                { city: locRegex },
                { state: locRegex },
                { country: locRegex }
            ]
        });
    }

    if (req.query.country) {
        andClauses.push({ country: new RegExp(`^${req.query.country}$`, 'i') });
    }

    if (req.query.states) {
        const statesList = req.query.states.split(',').map(s => s.trim());
        andClauses.push({ state: { $in: statesList.map(s => new RegExp(`^${s}$`, 'i')) } });
    } else if (req.query.state) {
        andClauses.push({ state: new RegExp(`^${req.query.state}$`, 'i') });
    }

    if (req.query.categories) {
        const cats = req.query.categories.split(',').map(c => new RegExp(`^${c.trim()}$`, 'i'));
        andClauses.push({ category: { $in: cats } });
    } else if (req.query.category) {
        andClauses.push({ category: new RegExp(`^${req.query.category}$`, 'i') });
    }

    if (req.query.skills) {
        const skillsList = req.query.skills.split(',').map(s => s.trim());
        andClauses.push({ requiredSkills: { $in: skillsList.map(s => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } });
    }

    if (req.query.experience) {
        const exps = req.query.experience.split(',').map(e => e.trim());
        const orConditions = [];

        exps.forEach(e => {
            if (e.toLowerCase() === 'fresher') {
                orConditions.push({ experience: /^(0|fresher|0\s*years?)$/i });
            } else if (e === '0-2 Years') {
                orConditions.push({ experience: /^(0|1|2|0-1|0-2|1-2)(\s*years?)?$|^0\s*-\s*2$|^02$/i });
            } else if (e === '2-4 Years') {
                orConditions.push({ experience: /^(2|3|4|2-3|3-4|2-4)(\s*years?)?$|^2\s*-\s*4$|^24$/i });
            } else if (e === '5+ Years') {
                orConditions.push({ experience: /^([5-9]|[1-9][0-9]+)(\s*years?)?$|^5\+$/i });
            } else {
                orConditions.push({ experience: new RegExp(e.replace('+', '\\+'), 'i') });
            }
        });

        if (orConditions.length > 0) {
            andClauses.push({ $or: orConditions });
        }
    }

    if (req.query.salaryMin || req.query.salaryMax) {
        if (req.query.salaryMin) {
            andClauses.push({ salaryMax: { $gte: Number(req.query.salaryMin) } });
        }
        if (req.query.salaryMax) {
            andClauses.push({ salaryMin: { $lte: Number(req.query.salaryMax) } });
        }
    }

    if (req.query.workType) andClauses.push({ workType: req.query.workType });
    if (req.query.currency) andClauses.push({ currency: req.query.currency });

    if (andClauses.length > 0) {
        filter.$and = andClauses;
    }

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

/**
 * @desc    Get top 5 popular job categories (by most applications)
 * @route   GET /api/jobs/popular-categories
 * @access  Public
 */
export const getPopularCategories = asyncHandler(async (req, res) => {
    // Top 5 categories where candidates applied the most (only for active jobs)
    let popular = await Application.aggregate([
        {
            $lookup: {
                from: 'jobs',
                localField: 'job',
                foreignField: '_id',
                as: 'jobData'
            }
        },
        { $unwind: '$jobData' },
        { 
            $match: { 
                'jobData.status': 'active', 
                'jobData.visibility': 'public',
                'jobData.category': { $nin: [null, ''] }
            } 
        },
        {
            $group: {
                _id: '$jobData.category',
                applicationCount: { $sum: 1 }
            }
        },
        { $sort: { applicationCount: -1 } },
        { $limit: 5 }
    ]);

    // Fallback logic removed as per user request to only show categories with applications
    // result construction
    const categoryNames = popular.map(p => p._id);
    const jobCounts = await Job.aggregate([
        { $match: { status: 'active', visibility: 'public', category: { $in: categoryNames } } },
        { $group: { _id: '$category', jobCount: { $sum: 1 } } }
    ]);
    const jobCountMap = {};
    jobCounts.forEach(j => { jobCountMap[j._id] = j.jobCount; });

    const result = popular.map(p => ({
        category: p._id,
        applicationCount: p.applicationCount || 0,
        jobCount: jobCountMap[p._id] || 0
    }));

    ApiResponse.success(result, 'Popular categories based on applications retrieved').send(res);
});

/**
 * @desc    Get available categories with job counts
 * @route   GET /api/jobs/available-categories
 * @access  Public
 */
export const getAvailableCategories = asyncHandler(async (req, res) => {
    // Return ALL categories from the master list so candidates can see the full search space
    const categories = Object.keys(masterCategories);

    // Get job counts per category (only for active public jobs)
    const jobCounts = await Job.aggregate([
        { $match: { status: 'active', visibility: 'public' } },
        { $group: { _id: '$category', jobCount: { $sum: 1 } } }
    ]);

    const countMap = {};
    jobCounts.forEach(j => {
        if (j._id) {
            countMap[j._id] = j.jobCount;
        }
    });

    const result = categories.map(cat => ({
        name: cat,
        jobCount: countMap[cat] || 0
    }));

    // Optionally sort: most jobs first, then alphabetically
    result.sort((a, b) => {
        if (b.jobCount !== a.jobCount) return b.jobCount - a.jobCount;
        return a.name.localeCompare(b.name);
    });

    ApiResponse.success(result, 'Available categories retrieved').send(res);
});
