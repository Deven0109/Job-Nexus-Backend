import mongoose from 'mongoose';

const JOB_REQUEST_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
};

const WORK_TYPES = ['Remote', 'Hybrid', 'Onsite'];
const URGENCY_LEVELS = ['Low', 'Medium', 'High'];

const CATEGORIES = [
    'Programming',
    'Data Science',
    'Designing',
    'Networking',
    'Management',
    'Marketing',
    'Cybersecurity',
    'Information Technology',
    'Healthcare',
    'Finance & Banking',
    'Education',
    'Manufacturing',
    'Sales',
    'Human Resources',
    'Engineering',
    'Design',
    'Customer Service',
    'Legal',
    'Accounting',
    'Operations',
    'Other',
];

const jobRequestSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employer',
            required: true,
        },
        createdByEmployer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        jobTitle: {
            type: String,
            required: [true, 'Job title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        jobCategory: {
            type: String,
            required: [true, 'Category is required'],
            enum: CATEGORIES,
        },
        numberOfVacancies: {
            type: Number,
            required: [true, 'Number of vacancies is required'],
            min: [1, 'At least 1 vacancy is required'],
        },
        experienceRequired: {
            type: String,
            required: [true, 'Experience requirement is required'],
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
        country: {
            type: String,
            required: [true, 'Country is required'],
            trim: true,
        },
        state: {
            type: String,
            required: [true, 'State is required'],
            trim: true,
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true,
        },
        location: {
            type: String,
            trim: true,
        },
        pincode: {
            type: String,
            trim: true,
        },
        requiredSkills: {
            type: [String],
            required: [true, 'At least one skill is required'],
            validate: {
                validator: (v) => v.length > 0,
                message: 'At least one skill is required',
            },
        },
        jobDescription: {
            type: String,
            required: [true, 'Job description is required'],
            trim: true,
            maxlength: [5000, 'Description cannot exceed 5000 characters'],
        },
        urgency: {
            type: String,
            required: [true, 'Urgency level is required'],
            enum: URGENCY_LEVELS,
            default: 'Medium',
        },
        status: {
            type: String,
            enum: Object.values(JOB_REQUEST_STATUS),
            default: JOB_REQUEST_STATUS.PENDING,
        },
        approvedByRecruiter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Job',
        },
    },
    { timestamps: true }
);

// Pre-save hook to generate formatted location
jobRequestSchema.pre('save', async function () {
    if (this.isModified('city') || this.isModified('state') || this.isModified('country') || !this.location) {
        const parts = [this.city, this.state, this.country].filter(Boolean);
        this.location = parts.join(', ').toUpperCase();
    }
});

// Indexes
jobRequestSchema.index({ companyId: 1 });
jobRequestSchema.index({ createdByEmployer: 1 });
jobRequestSchema.index({ status: 1 });
jobRequestSchema.index({ createdAt: -1 });

const JobRequest = mongoose.model('JobRequest', jobRequestSchema);

export { JOB_REQUEST_STATUS, WORK_TYPES, URGENCY_LEVELS, CATEGORIES };
export default JobRequest;
