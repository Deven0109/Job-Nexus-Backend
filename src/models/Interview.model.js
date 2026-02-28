import mongoose from 'mongoose';
import { INTERVIEW_STATUS, INTERVIEW_TYPES } from '../utils/constants.js';

const interviewSchema = new mongoose.Schema(
    {
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Application',
            required: true,
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Job',
            required: true,
        },
        interviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Reference to Employer or Recruiter
        },
        scheduledAt: {
            type: Date,
            required: true,
        },
        type: {
            type: String,
            enum: Object.values(INTERVIEW_TYPES),
            default: INTERVIEW_TYPES.VIDEO,
        },
        status: {
            type: String,
            enum: Object.values(INTERVIEW_STATUS),
            // Includes 'completed' (complte), 'pending', 'rescheduled' (reshudule), 'cancelled' (cancle)
            default: INTERVIEW_STATUS.PENDING,
        },
        meetingLink: {
            type: String,
        },
        feedback: {
            type: String,
        },
        notes: {
            type: String,
        }
    },
    { timestamps: true }
);

// Indexes requested by user
interviewSchema.index({ application: 1 });
interviewSchema.index({ scheduledAt: 1 });

// Additional helpful indexes
interviewSchema.index({ candidate: 1 });
interviewSchema.index({ job: 1 });
interviewSchema.index({ status: 1 });

const Interview = mongoose.model('Interview', interviewSchema);

export default Interview;
