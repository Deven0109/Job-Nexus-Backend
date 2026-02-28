import mongoose from 'mongoose';

const employerSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        companyName: {
            type: String,
            required: [true, 'Company name is required'],
            trim: true
        },
        companyEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        companyWebsite: {
            type: String,
            trim: true
        },
        companyDescription: {
            type: String,
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters']
        },
        companyLocation: {
            type: String,
            required: [true, 'Location is required']
        },
        companySize: {
            type: String,
            enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
            default: '1-10'
        },
        industry: {
            type: String,
            required: [true, 'Industry is required']
        },
        logo: {
            type: String // S3 URL
        },
        contactPersonName: {
            type: String,
            required: true,
            trim: true
        },
        contactPersonEmail: {
            type: String,
            lowercase: true,
            trim: true
        },
        contactPersonPhone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
            match: [/^\+?[0-9]{10,15}$/, 'Phone number must be between 10 and 15 digits and can include country code']
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        verifiedByAdmin: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// Indexes
employerSchema.index({ companyName: 1 });
employerSchema.index({ industry: 1 });
employerSchema.index({ status: 1 });
employerSchema.index({ verifiedByAdmin: 1 });

const Employer = mongoose.model('Employer', employerSchema);

export default Employer;
