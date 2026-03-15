import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },
        lastName: {
            type: String,
            trim: true,
            maxlength: [50, 'Last name cannot exceed 50 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                'Please provide a valid email address',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false, // Never return password by default
        },
        role: {
            type: String,
            enum: {
                values: Object.values(USER_ROLES),
                message: '{VALUE} is not a valid role',
            },
            default: USER_ROLES.CANDIDATE,
        },
        categories: {
            type: [String],
            default: [],
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
            match: [/^\+?[0-9]{10,15}$/, 'Phone number must be between 10 and 15 digits and can include country code'],
        },
        avatar: {
            type: String, // S3 URL
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        // ========== FIRST LOGIN OTP ==========
        isFirstLoginVerified: {
            type: Boolean,
            default: false,
        },
        otpCode: {
            type: String,
            default: null,
        },
        otpExpiry: {
            type: Date,
            default: null,
        },

        // ========== PASSWORD RESET OTP ==========
        resetPasswordOTP: String,
        resetPasswordOTPExpires: Date,

        // ========== REFRESH TOKEN ==========
        refreshToken: {
            type: String,
            select: false, // Never return in queries
        },

        // ========== PASSWORD RESET ==========
        passwordResetToken: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },

        // ========== LOGIN TRACKING ==========
        lastLoginAt: {
            type: Date,
            default: null,
        },
        loginCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
        toJSON: {
            virtuals: true,
            transform(doc, ret) {
                delete ret.password;
                delete ret.refreshToken;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpires;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
            transform(doc, ret) {
                delete ret.password;
                delete ret.refreshToken;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpires;
                delete ret.__v;
                return ret;
            },
        },
    }
);

// Virtual for Candidate Profile
userSchema.virtual('candidateProfile', {
    ref: 'Candidate',
    localField: '_id',
    foreignField: 'user',
    justOne: true
});

// ==================== INDEXES ====================
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// ==================== PRE-SAVE HOOK: PASSWORD HASHING ====================
userSchema.pre('save', async function () {
    // Only hash if password is modified
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// ==================== INSTANCE METHODS ====================

/**
 * Compare entered password with hashed password in DB
 * @param {string} enteredPassword - Plain text password
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Get user data suitable for JWT payload
 * @returns {Object}
 */
userSchema.methods.getJWTPayload = function () {
    return {
        id: this._id,
        email: this.email,
        role: this.role,
        firstName: this.firstName,
        lastName: this.lastName,
    };
};

/**
 * Get public profile (safe to send to client)
 * @returns {Object}
 */
userSchema.methods.getPublicProfile = function () {
    return {
        _id: this._id,
        firstName: this.firstName,
        lastName: this.lastName,
        email: this.email,
        role: this.role,
        categories: this.categories,
        phone: this.phone,
        avatar: this.avatar,
        isActive: this.isActive,
        isEmailVerified: this.isEmailVerified,
        lastLoginAt: this.lastLoginAt,
        createdAt: this.createdAt,
    };
};

const User = mongoose.model('User', userSchema);

export default User;
