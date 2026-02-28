import mongoose from 'mongoose';
import { WORK_TYPES, URGENCY_LEVELS, CATEGORIES } from './JobRequest.model.js';

const jobSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Job title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: CATEGORIES,
        },
        vacancies: {
            type: Number,
            required: [true, 'Number of vacancies is required'],
            min: [1, 'At least 1 vacancy is required'],
        },
        experience: {
            type: String,
            required: [true, 'Experience requirement is required'],
            trim: true,
        },
        location: {
            type: String,
            required: [true, 'Location is required'],
            trim: true,
        },
        salaryMin: {
            type: Number,
            required: [true, 'Minimum salary is required'],
            min: [0, 'Salary cannot be negative'],
        },
        salaryMax: {
            type: Number,
            required: [true, 'Maximum salary is required'],
        },
        workType: {
            type: String,
            required: [true, 'Work type is required'],
            enum: WORK_TYPES,
        },
        urgency: {
            type: String,
            required: [true, 'Urgency level is required'],
            enum: URGENCY_LEVELS,
            default: 'Medium',
        },
        requiredSkills: {
            type: [String],
            required: [true, 'At least one skill is required'],
            validate: {
                validator: (v) => v.length > 0,
                message: 'At least one skill is required',
            },
        },
        description: {
            type: String,
            required: [true, 'Job description is required'],
            trim: true,
            maxlength: [5000, 'Description cannot exceed 5000 characters'],
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employer',
            required: true,
        },
        createdByRecruiter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'closed'],
            default: 'active',
        },
        visibility: {
            type: String,
            enum: ['public', 'private'],
            default: 'public',
        },
        jobRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'JobRequest',
        },
    },
    { timestamps: true }
);

// Indexes
jobSchema.index({ title: 'text', description: 'text', requiredSkills: 'text' });
jobSchema.index({ location: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ visibility: 1 });
jobSchema.index({ companyId: 1 });
jobSchema.index({ createdByRecruiter: 1 });

const Job = mongoose.model('Job', jobSchema);
export default Job;
