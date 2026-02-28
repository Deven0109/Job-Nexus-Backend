import mongoose from 'mongoose';

const experienceSchema = new mongoose.Schema({
    company: { type: String, required: true },
    role: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    isCurrent: { type: Boolean, default: false },
    description: { type: String }
});

const educationSchema = new mongoose.Schema({
    institution: { type: String, required: true },
    degree: { type: String, required: true },
    fieldOfStudy: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    grade: { type: String }
});

const projectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    technologies: [{ type: String }],
    projectUrl: { type: String },
    startDate: { type: Date },
    endDate: { type: Date }
});

const candidateSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        firstName: {
            type: String,
            required: true,
            trim: true
        },
        lastName: {
            type: String,
            trim: true
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
            match: [/^\+?[0-9]{10,15}$/, 'Phone number must be between 10 and 15 digits and can include country code']
        },
        summary: {
            type: String,
            trim: true,
            maxlength: [1000, 'Summary cannot exceed 1000 characters']
        },
        skills: [{
            type: String,
            trim: true
        }],
        experience: [experienceSchema],
        education: [educationSchema],
        projects: [projectSchema],
        resumeUrl: {
            type: String // S3 URL
        },
        portfolioUrl: {
            type: String
        },
        socialLinks: {
            linkedin: String,
            github: String,
            twitter: String
        },
        isProfileComplete: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// Indexes
candidateSchema.index({ skills: 1 });
candidateSchema.index({ isProfileComplete: 1 });

const Candidate = mongoose.model('Candidate', candidateSchema);

export default Candidate;
