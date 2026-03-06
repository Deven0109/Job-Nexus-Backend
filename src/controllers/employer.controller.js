import User from '../models/User.model.js';
import Employer from '../models/Employer.model.js';
import Job from '../models/Job.model.js';
import Application from '../models/Application.model.js';
import asyncHandler from '../utils/asyncHandler.js';

import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

// ==================== GET PROFILE ====================

/**
 * @desc    Get employer's own profile (company info)
 * @route   GET /api/employer/profile
 * @access  Private/Employer
 */
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    const employer = await Employer.findOne({ userId: req.user.id });

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    ApiResponse.success(
        {
            user: user.getPublicProfile(),
            details: employer || {}
        },
        'Profile retrieved'
    ).send(res);
});

// ==================== UPDATE PROFILE ====================

/**
 * @desc    Update employer's own profile (company info)
 * @route   PUT /api/employer/profile
 * @access  Private/Employer
 */
export const updateProfile = asyncHandler(async (req, res) => {
    const {
        firstName,
        lastName,
        phone,
        avatar,
        companyName,
        description,
        website,
        industry,
        companySize,
        location,
        contactEmail,
        logo
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Update User model fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save({ validateBeforeSave: true });

    // Update Employer model fields
    const employer = await Employer.findOneAndUpdate(
        { userId: req.user.id },
        {
            $set: {
                companyName,
                companyDescription: description,
                companyWebsite: website,
                industry,
                companySize,
                companyLocation: location,
                companyEmail: contactEmail,
                contactPersonName: `${firstName || user.firstName} ${lastName || user.lastName}`,
                logo,
            }
        },
        { new: true, upsert: true }
    );

    ApiResponse.success(
        {
            user: user.getPublicProfile(),
            details: employer
        },
        'Profile updated successfully'
    ).send(res);
});

// ==================== GET DASHBOARD STATS ====================

/**
 * @desc    Get employer dashboard overview
 * @route   GET /api/employer/dashboard
 * @access  Private/Employer
 */
export const getDashboard = asyncHandler(async (req, res) => {
    const activeJobRequests = await Job.countDocuments({ employer: req.user.id, status: 'open' });
    // Other stats will be populated as needed

    const stats = {
        activeJobRequests,
        totalCandidatesReviewed: 0,
        interviewsScheduled: 0,
        hiresMade: 0,
    };

    ApiResponse.success({ stats }, 'Dashboard data retrieved').send(res);
});

/**
 * @desc    Get active jobs for this employer (posted by recruiter)
 * @route   GET /api/employer/active-jobs
 * @access  Private/Employer
 */
export const getActiveJobs = asyncHandler(async (req, res) => {
    // Find the employer document for this user
    const employerProfile = await Employer.findOne({ userId: req.user.id });
    if (!employerProfile) {
        throw ApiError.notFound('Employer profile not found');
    }

    const jobs = await Job.find({ companyId: employerProfile._id })
        .sort({ createdAt: -1 });

    ApiResponse.success({ jobs }, 'Active jobs retrieved').send(res);
});

/**
 * @desc    Get recent activity for employer dashboard
 * @route   GET /api/employer/recent-activity
 * @access  Private/Employer
 */
export const getRecentActivity = asyncHandler(async (req, res) => {
    const employerProfile = await Employer.findOne({ userId: req.user.id });
    if (!employerProfile) {
        throw ApiError.notFound('Employer profile not found');
    }

    const jobs = await Job.find({ companyId: employerProfile._id });
    const jobIds = jobs.map(j => j._id);

    const activity = await Application.find({ job: { $in: jobIds } })
        .populate({
            path: 'candidate',
            select: 'firstName lastName email avatar'
        })
        .populate('job', 'title location city state country workType experience salaryMin salaryMax')
        .sort({ updatedAt: -1 })
        .limit(10);

    ApiResponse.success(activity, 'Recent activity retrieved').send(res);
});
