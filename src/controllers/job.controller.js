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

    if (andClauses.length > 0) {
        filter.$and = andClauses;
    }

    if (req.query.country) {
        filter.country = new RegExp(`^${req.query.country}$`, 'i');
    }

    if (req.query.states) {
        const statesList = req.query.states.split(',').map(s => s.trim());
        if (filter.state) {
            filter.state = { $in: [...statesList, filter.state] };
        } else {
            filter.state = new RegExp(statesList.join('|'), 'i');
        }
    } else if (req.query.state) {
        filter.state = new RegExp(`^${req.query.state}$`, 'i');
    }

    if (req.query.categories) {
        const cats = req.query.categories.split(',').map(c => new RegExp(`^${c.trim()}$`, 'i'));
        filter.category = { $in: cats };
    } else if (req.query.category) {
        const category = req.query.category;
        if (category === "Programming") {
            filter.title = { $regex: "developer|engineer|software|mern|react|node|java|python|flutter", $options: "i" };
        } else if (category === "Data Science") {
            filter.title = { $regex: "data|machine learning|ai|analytics|ml", $options: "i" };
        } else if (category === "Designing") {
            filter.title = { $regex: "designer|ui|ux|graphic|product", $options: "i" };
        } else if (category === "Networking") {
            filter.title = { $regex: "network|system|cloud|it support", $options: "i" };
        } else if (category === "Management") {
            filter.title = { $regex: "manager|management|operations|hr", $options: "i" };
        } else if (category === "Marketing") {
            filter.title = { $regex: "marketing|seo|social media|content", $options: "i" };
        } else if (category === "Cybersecurity") {
            filter.title = { $regex: "security|cyber|hacker|penetration|soc", $options: "i" };
        } else {
            filter.category = new RegExp(`^${category}$`, 'i');
        }
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
