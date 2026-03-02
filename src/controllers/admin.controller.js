import User from '../models/User.model.js';
import Job from '../models/Job.model.js';
import Application from '../models/Application.model.js';
import Candidate from '../models/Candidate.model.js';
import Employer from '../models/Employer.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta, buildSort, cleanObject } from '../utils/helpers.js';
import { USER_ROLES, APPLICATION_STATUS } from '../utils/constants.js';

// ==================== DASHBOARD STATS ====================

/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
    const { period = 'Month' } = req.query;

    // Define time range and grouping based on period
    let startDate;
    let groupFields;
    const now = new Date();

    if (period === 'Week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        groupFields = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
        };
    } else if (period === 'Year') {
        // Last 5 years
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 5);
        groupFields = {
            year: { $year: '$createdAt' }
        };
    } else {
        // Month (Default 6 months)
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 6);
        groupFields = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
        };
    }

    // Run all aggregation in parallel for performance
    const [
        totalUsers,
        activeUsers,
        roleDistribution,
        recentUsers,
        totalJobs,
        totalApplications,
        totalShortlisted,
        recentApplications,
        registrationTrend,
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('firstName lastName email role isActive createdAt'),
        Job.countDocuments(),
        Application.countDocuments(),
        Application.countDocuments({ status: APPLICATION_STATUS.SHORTLISTED }),
        Application.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('candidate', 'firstName lastName avatar')
            .populate('job', 'title'),

        // Detailed Activity Trend based on period
        Promise.all([
            User.aggregate([
                { $match: { role: USER_ROLES.EMPLOYER, createdAt: { $gte: startDate } } },
                { $group: { _id: groupFields, count: { $sum: 1 } } }
            ]),
            User.aggregate([
                { $match: { role: USER_ROLES.CANDIDATE, createdAt: { $gte: startDate } } },
                { $group: { _id: groupFields, count: { $sum: 1 } } }
            ]),
            Job.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: groupFields, count: { $sum: 1 } } }
            ]),
            Application.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: groupFields, count: { $sum: 1 } } }
            ])
        ])
    ]);

    // Format role distribution
    const roles = {};
    roleDistribution.forEach((r) => {
        roles[r._id] = r.count;
    });

    // Format trends into a unified structure
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [empTrend, candTrend, jobTrend, appTrend] = registrationTrend;

    const trendMap = {};
    const getTrendKey = (d) => {
        if (period === 'Week') return `${d.year}-${d.month}-${d.day}`;
        if (period === 'Year') return `${d.year}`;
        return `${d.year}-${d.month}`;
    };

    const processTrend = (data, key) => {
        data.forEach(d => {
            const tKey = getTrendKey(d._id);
            if (!trendMap[tKey]) {
                let label = '';
                if (period === 'Week') {
                    label = `${d._id.day} ${monthNames[d._id.month - 1]}`;
                } else if (period === 'Year') {
                    label = `${d._id.year}`;
                } else {
                    label = `${monthNames[d._id.month - 1]} ${d._id.year}`;
                }

                trendMap[tKey] = {
                    label,
                    year: d._id.year,
                    month: d._id.month || 0,
                    day: d._id.day || 0,
                    employers: 0,
                    candidates: 0,
                    jobs: 0,
                    applications: 0
                };
            }
            trendMap[tKey][key] = d.count;
        });
    };

    processTrend(empTrend, 'employers');
    processTrend(candTrend, 'candidates');
    processTrend(jobTrend, 'jobs');
    processTrend(appTrend, 'applications');

    // Convert map to sorted array
    const activityTrend = Object.values(trendMap).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.month !== b.month) return a.month - b.month;
        return a.day - b.day;
    });

    ApiResponse.success(
        {
            overview: {
                totalUsers,
                activeUsers,
                inactiveUsers: totalUsers - activeUsers,
                candidates: roles[USER_ROLES.CANDIDATE] || 0,
                recruiters: roles[USER_ROLES.RECRUITER] || 0,
                employers: roles[USER_ROLES.EMPLOYER] || 0,
                admins: roles[USER_ROLES.ADMIN] || 0,
                jobs: totalJobs,
                applications: totalApplications,
                shortlisted: totalShortlisted,
            },
            activityTrend,
            recentUsers,
            recentApplications,
        },
        'Dashboard stats retrieved'
    ).send(res);
});



// ==================== LIST ALL USERS ====================

/**
 * @desc    Get all users with search, filter, sort, pagination
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
export const listUsers = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const sortObj = buildSort(req.query.sort);

    // Build filter object
    const filter = {};

    if (req.query.role) {
        filter.role = req.query.role;
    }

    if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
    }

    // Search by name or email
    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
        ];
    }

    const [users, total] = await Promise.all([
        User.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .select('firstName lastName email role phone isActive isEmailVerified lastLoginAt loginCount createdAt'),
        User.countDocuments(filter),
    ]);

    ApiResponse.success(
        {
            users,
            pagination: paginationMeta(total, page, limit),
        },
        'Users retrieved'
    ).send(res);
});

// ==================== GET SINGLE USER ====================

/**
 * @desc    Get a single user by ID
 * @route   GET /api/admin/users/:id
 * @access  Private/Admin
 */
export const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('firstName lastName email role phone isActive isEmailVerified lastLoginAt loginCount createdAt updatedAt');

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    ApiResponse.success({ user }, 'User retrieved').send(res);
});

// ==================== CREATE USER ====================

/**
 * @desc    Admin creates a new user (can assign any role including recruiter/admin)
 * @route   POST /api/admin/users
 * @access  Private/Admin
 */
export const createUser = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, role, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw ApiError.conflict('An account with this email already exists');
    }

    // Create user (password is hashed via pre-save hook)
    const user = await User.create(
        cleanObject({
            firstName,
            lastName,
            email,
            password,
            role,
            phone,
        })
    );

    // ========== ROLE-SPECIFIC PROFILE CREATION ==========
    if (role === USER_ROLES.CANDIDATE) {
        await Candidate.create({
            user: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            skills: [],
            experience: [],
            education: []
        });
        console.log('Candidate profile created by Admin for:', email);
    } else if (role === USER_ROLES.EMPLOYER) {
        await Employer.create({
            userId: user._id,
            contactPersonName: user.firstName + (user.lastName ? ' ' + user.lastName : ''),
            contactPersonEmail: user.email,
            contactPersonPhone: user.phone,
            companyName: `${firstName}'s Company`,
            companyEmail: user.email,
            industry: 'Not Specified',
            companyLocation: 'Not Specified'
        });
        console.log('Employer profile created by Admin for:', email);
    }

    ApiResponse.created(
        { user: user.getPublicProfile() },
        `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`
    ).send(res);
});

// ==================== UPDATE USER ====================

/**
 * @desc    Admin updates a user's details
 * @route   PUT /api/admin/users/:id
 * @access  Private/Admin
 */
export const updateUser = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, role, phone, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Prevent admin from modifying their own role
    if (req.params.id === req.user.id && role && role !== user.role) {
        throw ApiError.badRequest('You cannot change your own role');
    }

    // Prevent deactivating yourself
    if (req.params.id === req.user.id && isActive === false) {
        throw ApiError.badRequest('You cannot deactivate your own account');
    }

    // If email is changing, check uniqueness
    if (email && email !== user.email) {
        const emailExists = await User.findOne({ email });
        if (emailExists) {
            throw ApiError.conflict('An account with this email already exists');
        }
    }

    // Apply updates
    const updates = cleanObject({ firstName, lastName, email, role, phone });
    if (isActive !== undefined) updates.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('firstName lastName email role phone isActive isEmailVerified lastLoginAt loginCount createdAt updatedAt');

    // ========== ROLE-SPECIFIC PROFILE SYNC ==========
    if (updatedUser.role === USER_ROLES.CANDIDATE) {
        const { skills, education, experience, bio, location } = req.body;
        await Candidate.findOneAndUpdate(
            { user: updatedUser._id },
            {
                $set: cleanObject({
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    email: updatedUser.email,
                    phone: updatedUser.phone,
                    location,
                    bio,
                    skills,
                    education,
                    experience
                })
            },
            { upsert: true }
        );
    } else if (updatedUser.role === USER_ROLES.EMPLOYER) {
        const {
            companyName,
            industry,
            companyLocation,
            companyDescription,
            companyWebsite,
            companySize,
            companyEmail,
            logo,
            status,
            verifiedByAdmin
        } = req.body;

        await Employer.findOneAndUpdate(
            { userId: updatedUser._id },
            {
                $set: cleanObject({
                    contactPersonName: updatedUser.firstName + (updatedUser.lastName ? ' ' + updatedUser.lastName : ''),
                    contactPersonEmail: updatedUser.email,
                    contactPersonPhone: updatedUser.phone,
                    companyName,
                    industry,
                    companyLocation,
                    companyDescription,
                    companyWebsite,
                    companySize,
                    companyEmail,
                    logo,
                    status,
                    verifiedByAdmin
                })
            },
            { upsert: true }
        );
    }

    ApiResponse.success(
        { user: updatedUser },
        'User updated successfully'
    ).send(res);
});

// ==================== TOGGLE USER STATUS ====================

/**
 * @desc    Activate or deactivate a user
 * @route   PATCH /api/admin/users/:id/toggle-status
 * @access  Private/Admin
 */
export const toggleUserStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Prevent self-deactivation
    if (req.params.id === req.user.id) {
        throw ApiError.badRequest('You cannot toggle your own account status');
    }

    user.isActive = !user.isActive;

    // If deactivating, clear refresh token to force logout
    if (!user.isActive) {
        user.refreshToken = undefined;
    }

    await user.save({ validateBeforeSave: false });

    ApiResponse.success(
        {
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            },
        },
        `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
    ).send(res);
});

// ==================== DELETE USER ====================

/**
 * @desc    Permanently delete a user
 * @route   DELETE /api/admin/users/:id
 * @access  Private/Admin
 */
export const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Prevent self-deletion
    if (req.params.id === req.user.id) {
        throw ApiError.badRequest('You cannot delete your own account');
    }

    await User.findByIdAndDelete(req.params.id);

    ApiResponse.success(null, 'User deleted successfully').send(res);
});

// ==================== LIST EMPLOYERS ====================

/**
 * @desc    Get all employer accounts with status filtering
 * @route   GET /api/admin/employers
 * @access  Private/Admin
 */
export const listEmployers = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);

    const filter = { role: USER_ROLES.EMPLOYER };

    if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
    }

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
        ];
    }

    const [users, total] = await Promise.all([
        User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('firstName lastName email phone isActive isEmailVerified lastLoginAt createdAt'),
        User.countDocuments(filter),
    ]);

    // Merge status and verifiedByAdmin from Employer profile
    const userIds = users.map(u => u._id);
    const employerProfiles = await Employer.find({ userId: { $in: userIds } }).select('userId status verifiedByAdmin logo companyName');

    const employers = users.map(u => {
        const profile = employerProfiles.find(p => p.userId.toString() === u._id.toString());
        return {
            ...u.toObject(),
            status: profile?.status || 'pending',
            verifiedByAdmin: profile?.verifiedByAdmin || false,
            logo: profile?.logo,
            companyName: profile?.companyName
        };
    });

    ApiResponse.success(
        {
            employers,
            pagination: paginationMeta(total, page, limit),
        },
        'Employers retrieved'
    ).send(res);
});

// ==================== LIST CANDIDATES ====================

/**
 * @desc    Get all candidate accounts
 * @route   GET /api/admin/candidates
 * @access  Private/Admin
 */
export const listCandidates = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const sortObj = buildSort(req.query.sort) || { createdAt: -1 };

    const filter = { role: USER_ROLES.CANDIDATE };

    if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
    }

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
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .select('firstName lastName email phone isActive lastLoginAt createdAt'),
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

// ==================== LIST RECRUITERS ====================

/**
 * @desc    Get all recruiter accounts
 * @route   GET /api/admin/recruiters
 * @access  Private/Admin
 */
export const listRecruiters = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);
    const sortObj = buildSort(req.query.sort) || { createdAt: -1 };

    const filter = { role: USER_ROLES.RECRUITER };

    if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
    }

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
        ];
    }

    const [recruiters, total] = await Promise.all([
        User.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .select('firstName lastName email phone isActive lastLoginAt createdAt'),
        User.countDocuments(filter),
    ]);

    ApiResponse.success(
        {
            recruiters,
            pagination: paginationMeta(total, page, limit),
        },
        'Recruiters retrieved'
    ).send(res);
});

// ==================== GET EMPLOYER COMPANY PROFILE ====================

/**
 * @desc    Get a specific employer's company profile by user ID
 * @route   GET /api/admin/employers/:userId/profile
 * @access  Private/Admin
 */
export const getEmployerProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId)
        .select('firstName lastName email phone isActive createdAt');

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    const employer = await Employer.findOne({ userId: req.params.userId });

    ApiResponse.success(
        {
            user,
            companyProfile: employer || {}
        },
        'Employer profile retrieved'
    ).send(res);
});

// ==================== TOGGLE EMPLOYER VERIFICATION ====================

/**
 * @desc    Verify or unverify an employer
 * @route   PATCH /api/admin/employers/:userId/verify
 * @access  Private/Admin
 */
export const toggleEmployerVerification = asyncHandler(async (req, res) => {
    const { status } = req.body || {}; // 'approved' or 'rejected'

    const user = await User.findById(req.params.userId);

    if (!user || user.role !== USER_ROLES.EMPLOYER) {
        throw ApiError.notFound('Employer not found');
    }

    const employer = await Employer.findOne({ userId: req.params.userId });
    if (!employer) throw ApiError.notFound('Employer profile not found');

    if (status) {
        employer.status = status;
        employer.verifiedByAdmin = (status === 'approved');
    } else {
        // Fallback to toggle if no status provided
        employer.verifiedByAdmin = !employer.verifiedByAdmin;
        employer.status = employer.verifiedByAdmin ? 'approved' : 'pending';
    }

    await employer.save();

    ApiResponse.success(
        { userId: user._id, verifiedByAdmin: employer.verifiedByAdmin, status: employer.status },
        `Employer updated to ${employer.status}`
    ).send(res);
});
