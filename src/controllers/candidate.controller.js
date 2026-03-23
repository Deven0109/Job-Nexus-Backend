import User from '../models/User.model.js';
import Candidate from '../models/Candidate.model.js';
import Application from '../models/Application.model.js';
import Job from '../models/Job.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';
import { extractTextFromFile, parseResumeToProfile } from '../services/resumeParser.service.js';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'resumes');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}


// ==================== GET PROFILE ====================

/**
 * @desc    Get candidate's own profile
 * @route   GET /api/candidate/profile
 * @access  Private/Candidate
 */
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    const candidate = await Candidate.findOne({ user: req.user.id });

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    ApiResponse.success(
        {
            user: user.getPublicProfile(),
            details: candidate || {}
        },
        'Profile retrieved'
    ).send(res);
});

// ==================== UPDATE PROFILE ====================

/**
 * @desc    Update candidate's own profile
 * @route   PUT /api/candidate/profile
 * @access  Private/Candidate
 */
export const updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, avatar, summary, skills, experience, education, projects, portfolioUrl, socialLinks } = req.body;

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

    // Update Candidate model fields
    const candidate = await Candidate.findOneAndUpdate(
        { user: req.user.id },
        {
            $set: {
                summary,
                skills,
                experience,
                education,
                projects,
                portfolioUrl,
                socialLinks,
                isProfileComplete: true // Simplistic for now
            }
        },
        { new: true, upsert: true }
    );

    ApiResponse.success(
        {
            user: user.getPublicProfile(),
            details: candidate
        },
        'Profile updated successfully'
    ).send(res);
});

// ==================== PARSE RESUME ====================

/**
 * @desc    Parse uploaded resume, extract candidate data & auto-save
 * @route   POST /api/candidate/resume/parse
 * @access  Private/Candidate
 */
export const parseResume = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw ApiError.badRequest('Resume file is required');
    }

    // 1. Extract text from file buffer
    let parsedData = {};
    try {
        const rawText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
        parsedData = parseResumeToProfile(rawText);
    } catch (err) {
        console.warn('Silent parsing issue:', err.message);
    }

    // 1b. Save physical file to disk
    const extension = path.extname(req.file.originalname) || '.pdf';
    const fileName = `resume_${req.user.id}_${Date.now()}${extension}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, req.file.buffer);
    const resumeUrl = `/uploads/resumes/${fileName}`;

    // 3. Auto-save the parsed data instantly
    const user = await User.findById(req.user.id);
    if (user) {
        if (parsedData.firstName && !user.firstName) user.firstName = parsedData.firstName;
        if (parsedData.lastName && !user.lastName) user.lastName = parsedData.lastName;
        if (parsedData.phone && !user.phone) user.phone = parsedData.phone;
        await user.save({ validateBeforeSave: true });
    }

    const candidate = await Candidate.findOneAndUpdate(
        { user: req.user.id },
        {
            $set: {
                summary: parsedData.summary,
                skills: parsedData.skills,
                experience: parsedData.experience,
                education: parsedData.education,
                projects: parsedData.projects,
                resumeUrl: resumeUrl,
                isProfileComplete: true
            }
        },
        { new: true, upsert: true }
    );

    // 4. Return JSON back to the client immediately
    ApiResponse.success(
        { parsedProfile: parsedData, dbCandidate: candidate, resumeUrl },
        'Resume uploaded and parsed successfully'
    ).send(res);
});

// ==================== GET DASHBOARD STATS ====================

import { APPLICATION_STATUS } from '../utils/constants.js';

/**
 * @desc    Get candidate dashboard overview
 * @route   GET /api/candidate/dashboard
 * @access  Private/Candidate
 */
export const getDashboard = asyncHandler(async (req, res) => {
    const [totalApplications, interviewsScheduled, finalSelected, candidate] = await Promise.all([
        Application.countDocuments({ candidate: req.user.id }),
        Application.countDocuments({
            candidate: req.user.id,
            status: APPLICATION_STATUS.INTERVIEW_SCHEDULED
        }),
        Application.countDocuments({
            candidate: req.user.id,
            status: APPLICATION_STATUS.FINAL_SELECTED
        }),
        Candidate.findOne({ user: req.user.id })
    ]);

    const stats = {
        totalApplications,
        interviewsScheduled,
        offersReceived: finalSelected, // Using final selection as "offers"
        profileCompletion: candidate?.isProfileComplete ? 100 : calculateProfileCompletion(req.user),
    };

    ApiResponse.success({ stats }, 'Dashboard data retrieved').send(res);
});

// ==================== JOB APPLICATIONS ====================

/**
 * @desc    Apply for a job
 * @route   POST /api/candidate/applications
 * @access  Private/Candidate
 */
export const applyToJob = asyncHandler(async (req, res) => {
    const { jobId, answers, resume } = req.body;

    // Check if job exists and is open
    const job = await Job.findById(jobId);
    if (!job || job.status !== 'active') {
        throw ApiError.notFound('Job not found or is no longer accepting applications');
    }

    // Check for duplicate application
    const existing = await Application.findOne({
        job: jobId,
        candidate: req.user.id
    });

    if (existing) {
        throw ApiError.conflict('You have already applied for this job');
    }

    // Create application
    const application = await Application.create({
        job: jobId,
        candidate: req.user.id,
        answers,
        resume: resume || req.user.avatar // Fallback to avatar if no resume provided
    });

    ApiResponse.created({ application }, 'Application submitted successfully').send(res);
});

/**
 * @desc    Get candidate's job applications
 * @route   GET /api/candidate/applications
 * @access  Private/Candidate
 */
export const getMyApplications = asyncHandler(async (req, res) => {
    const { page, limit, skip } = buildPagination(req.query);

    const [applications, total] = await Promise.all([
        Application.find({ candidate: req.user.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'job',
                populate: { path: 'companyId', select: 'companyName' },
                select: 'title location workType salaryMin salaryMax currency status'
            }),
        Application.countDocuments({ candidate: req.user.id })
    ]);

    ApiResponse.success(
        {
            applications,
            pagination: paginationMeta(total, page, limit)
        },
        'Applications retrieved'
    ).send(res);
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate profile completion percentage
 */
const calculateProfileCompletion = (user) => {
    const fields = ['firstName', 'lastName', 'email', 'phone', 'avatar'];
    const filled = fields.filter((f) => user[f]).length;
    return Math.round((filled / fields.length) * 100);
};
