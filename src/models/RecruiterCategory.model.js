import mongoose from 'mongoose';

const recruiterCategorySchema = new mongoose.Schema({
    recruiterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    categoryName: {
        type: String,
        required: true
    },
    selectedJobTitles: {
        type: [String],
        required: true,
        validate: {
            validator: (v) => v.length > 0,
            message: 'At least one job title is required'
        }
    }
}, { timestamps: true });

// Ensure a recruiter cannot have multiple separate entries for the same category.
// They should just update their existing entry's selectedJobTitles array.
recruiterCategorySchema.index({ recruiterId: 1, categoryName: 1 }, { unique: true });

const RecruiterCategory = mongoose.model('RecruiterCategory', recruiterCategorySchema);
export default RecruiterCategory;
