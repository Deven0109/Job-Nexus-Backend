import mongoose from 'mongoose';
import { APPLICATION_STATUS } from '../utils/constants.js';

const applicationSchema = new mongoose.Schema(
    {
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Job',
            required: true,
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(APPLICATION_STATUS),
            default: APPLICATION_STATUS.APPLIED,
        },
        resume: {
            type: String, // S3 URL
        },
        answers: [
            {
                question: String,
                answer: String,
            },
        ],
        notes: [
            {
                text: String,
                addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

// Indexes
applicationSchema.index({ job: 1 });
applicationSchema.index({ candidate: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true }); // Prevent duplicate applications
applicationSchema.index({ createdAt: -1 });

const Application = mongoose.model('Application', applicationSchema);
export default Application;
