import User from '../models/User.model.js';
import Candidate from '../models/Candidate.model.js';
import Employer from '../models/Employer.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
    generateTokenPair,
    verifyRefreshToken,
    getRefreshTokenCookieOptions,
} from '../utils/jwt.js';
import sendEmail from '../utils/email.js';
import crypto from 'crypto';

// ==================== REGISTER ====================

/**
 * @desc    Register a new user (candidate, recruiter, or employer — NOT admin)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, role, phone } = req.body;
    const normalizedRole = (role || 'candidate').toLowerCase();
    const normalizedEmail = (email || '').trim().toLowerCase();

    console.log('Register attempt:', { firstName, lastName, normalizedEmail, normalizedRole });

    // Block admin registration via public API
    if (normalizedRole === 'admin') {
        throw ApiError.forbidden(
            'Admin accounts cannot be registered. Contact system administrator.'
        );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
        console.log('Conflict found. Email already exists:', normalizedEmail, 'as a', existingUser.role);
        throw ApiError.conflict(
            `An account with this email already exists as a ${existingUser.role}. Please Sign In instead.`
        );
    }

    // Create user (password is hashed via pre-save hook)
    try {
        const user = await User.create({
            firstName,
            lastName,
            email: normalizedEmail,
            password,
            role: normalizedRole,
            phone,
        });

        // ========== ROLE-SPECIFIC PROFILE CREATION ==========
        try {
            if (user.role === 'candidate') {
                await Candidate.create({
                    user: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone,
                });
                console.log('Candidate profile created for:', user.email);
            } else if (user.role === 'employer') {
                await Employer.create({
                    userId: user._id,
                    companyName: `${firstName}'s Company`,
                    companyEmail: user.email,
                    contactPersonName: user.firstName + (user.lastName ? ' ' + user.lastName : ''),
                    contactPersonEmail: user.email,
                    contactPersonPhone: user.phone,
                    industry: 'Not Specified',
                    companyLocation: 'Not Specified'
                });
                console.log('Employer profile created for:', user.email);
            }
            // Recruiter role doesn't need a separate profile model currently
        } catch (profileError) {
            console.error('Profile creation failed, rolling back user registration:', profileError);
            // Delete user if profile fails so they can retry
            await User.findByIdAndDelete(user._id);

            // Re-throw with descriptive message
            if (profileError.code === 11000) {
                const field = Object.keys(profileError.keyValue)[0];
                throw ApiError.conflict(`A profile with this ${field} already exists.`);
            }
            throw profileError;
        }

        console.log('User created successfully:', user.email, 'Role:', user.role);

        // Get public profile (excludes sensitive fields)
        const userProfile = user.getPublicProfile();

        // Send Welcome Email (SMTP)
        try {
            await sendEmail({
                email: user.email,
                subject: 'Welcome to Job Consultancy Platform',
                message: `Hello ${user.firstName},\n\nYour account has been created successfully as a ${user.role}.\n\nYou can now log in and explore our platform.\n\nBest regards,\nJob Consultancy Team`,
            });
        } catch (emailErr) {
            console.error('Welcome email failed to send:', emailErr);
            // We don't throw here so registration isn't blocked by email failure
        }

        ApiResponse.created(
            { user: userProfile },
            'Registration successful. Welcome email has been sent.'
        ).send(res);
    } catch (error) {
        console.error('User creation failed:', error);
        throw error;
    }
});

// ==================== LOGIN ====================

/**
 * @desc    Login user and return tokens
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req, res) => {
    const { email, password, role } = req.body;

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password +refreshToken');
    console.log('Login attempt for:', email);
    console.log('User found:', !!user);

    if (!user) {
        throw ApiError.unauthorized('Invalid credentials');
    }

    if (role && user.role !== role) {
        throw ApiError.unauthorized('Invalid credentials');
    }

    // Check if account is active
    console.log(`Checking isActive for ${user.email}: ${user.isActive} (Type: ${typeof user.isActive})`);
    if (!user.isActive) {
        throw ApiError.forbidden(
            'Your account has been deactivated. Please contact support.'
        );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    console.log('Password valid:', isPasswordValid);
    if (!isPasswordValid) {
        throw ApiError.unauthorized('Invalid credentials');
    }

    // ==================== FIRST-TIME LOGIN OTP FLOW ====================
    // For non-admin users, require OTP on the very first successful login
    if (!user.isFirstLoginVerified && user.role !== 'admin') {
        // Generate 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        user.otpCode = otp;
        user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await user.save({ validateBeforeSave: false });

        const message = `Hello, Your verification code is: ${otp}`;

        // Log OTP in development for easier debugging
        if (process.env.NODE_ENV === 'development') {
            console.log('\n==========================================');
            console.log(`LOGIN OTP FOR: ${user.email}`);
            console.log(`CODE: ${otp}`);
            console.log('==========================================\n');
        }

        try {
            await sendEmail({
                email: user.email,
                subject: 'Login Verification OTP',
                message,
            });

            return ApiResponse.success(
                {
                    requiresOtp: true,
                    email: user.email,
                },
                'OTP sent to your email address for login verification.'
            ).send(res);
        } catch (error) {
            console.error('Login OTP email sending failed:', error);

            // DEVELOPMENT FALLBACK: allow testing even if SMTP is misconfigured
            if (process.env.NODE_ENV === 'development') {
                return ApiResponse.success(
                    {
                        requiresOtp: true,
                        email: user.email,
                        otp, // so you can see it in API response/console
                    },
                    'OTP generated! (Check terminal / response since email failed - likely SMTP settings).'
                ).send(res);
            }

            // In non-development environments, clear OTP and block login
            user.otpCode = null;
            user.otpExpiry = null;
            await user.save({ validateBeforeSave: false });

            throw ApiError.internal('Failed to send login OTP. Please check your SMTP settings.');
        }
    }

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);

    // ========== LAZY PROFILE CREATION (Safety Net) ==========
    if (user.role === 'candidate') {
        const candidateExists = await Candidate.findOne({ user: user._id });
        if (!candidateExists) {
            try {
                await Candidate.create({
                    user: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone,
                });
                console.log('Lazy created Candidate profile for:', user.email);
            } catch (err) { console.error('Lazy profile fail:', err.message); }
        }
    } else if (user.role === 'employer') {
        const employerExists = await Employer.findOne({ userId: user._id });
        if (!employerExists) {
            try {
                await Employer.create({
                    userId: user._id,
                    companyName: `${user.firstName}'s Company`,
                    companyEmail: user.email,
                    contactPersonName: user.firstName + (user.lastName ? ' ' + user.lastName : ''),
                    contactPersonEmail: user.email,
                    contactPersonPhone: user.phone,
                    industry: 'Not Specified',
                    companyLocation: 'Not Specified'
                });
                console.log('Lazy created Employer profile for:', user.email);
            } catch (err) { console.error('Lazy profile fail:', err.message); }
        }
    }

    // Store refresh token in DB
    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save({ validateBeforeSave: false });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    // Return response
    ApiResponse.success(
        {
            accessToken,
            user: user.getPublicProfile(),
        },
        'Login successful'
    ).send(res);
});

// ==================== FIRST LOGIN OTP VERIFICATION ====================

/**
 * @desc    Verify first-login OTP and complete login
 * @route   POST /api/auth/verify-login-otp
 * @access  Public
 */
export const verifyLoginOtp = asyncHandler(async (req, res) => {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
        throw ApiError.badRequest('Email and OTP code are required.');
    }

    const user = await User.findOne({ email }).select('+password +refreshToken');

    if (!user) {
        // Keep this as a bad request to avoid global 401 handlers redirecting to /login
        throw ApiError.badRequest('Invalid email or OTP.');
    }

    // Admin should not go through this flow (admin uses dedicated panel)
    if (user.role === 'admin') {
        throw ApiError.forbidden('Admin accounts must use the Admin Panel login.');
    }

    if (user.isFirstLoginVerified) {
        throw ApiError.badRequest('First login already verified. Please login normally.');
    }

    if (!user.otpCode || !user.otpExpiry) {
        throw ApiError.badRequest('No OTP generated. Please request a new OTP.');
    }

    if (user.otpCode !== otpCode) {
        // Use 400 (not 401) so frontend doesn't treat it as "session expired"
        throw ApiError.badRequest('OTP is invalid.');
    }

    if (user.otpExpiry < new Date()) {
        // Use 400 (not 401) so frontend doesn't redirect to login
        throw ApiError.badRequest('OTP has expired.');
    }

    // Mark first login as verified and clear OTP fields
    user.isFirstLoginVerified = true;
    user.isEmailVerified = true;
    user.otpCode = null;
    user.otpExpiry = null;

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);

    // ========== LAZY PROFILE CREATION (Safety Net) ==========
    if (user.role === 'candidate') {
        const candidateExists = await Candidate.findOne({ user: user._id });
        if (!candidateExists) {
            try {
                await Candidate.create({
                    user: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone,
                });
                console.log('Lazy created Candidate profile for (OTP flow):', user.email);
            } catch (err) {
                console.error('Lazy profile fail (OTP flow):', err.message);
            }
        }
    } else if (user.role === 'employer') {
        const employerExists = await Employer.findOne({ userId: user._id });
        if (!employerExists) {
            try {
                await Employer.create({
                    userId: user._id,
                    companyName: `${user.firstName}'s Company`,
                    companyEmail: user.email,
                    contactPersonName:
                        user.firstName + (user.lastName ? ' ' + user.lastName : ''),
                    contactPersonEmail: user.email,
                    contactPersonPhone: user.phone,
                    industry: 'Not Specified',
                    companyLocation: 'Not Specified',
                });
                console.log('Lazy created Employer profile for (OTP flow):', user.email);
            } catch (err) {
                console.error('Lazy profile fail (OTP flow):', err.message);
            }
        }
    }

    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save({ validateBeforeSave: false });

    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    ApiResponse.success(
        {
            accessToken,
            user: user.getPublicProfile(),
        },
        'OTP verified. Login successful.'
    ).send(res);
});

// ==================== RESEND FIRST LOGIN OTP ====================

/**
 * @desc    Resend first-login OTP
 * @route   POST /api/auth/resend-login-otp
 * @access  Public
 */
export const resendLoginOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw ApiError.badRequest('Email is required.');
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw ApiError.notFound('User not found.');
    }

    // Admin should not go through this flow
    if (user.role === 'admin') {
        throw ApiError.forbidden('Admin accounts must use the Admin Panel login.');
    }

    if (user.isFirstLoginVerified) {
        throw ApiError.badRequest('First login already verified. Please login normally.');
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.otpCode = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await user.save({ validateBeforeSave: false });

    const message = `Hello, Your verification code is: ${otp}`;

    // Log OTP in development for easier debugging
    if (process.env.NODE_ENV === 'development') {
        console.log('\n==========================================');
        console.log(`LOGIN OTP (RESEND) FOR: ${user.email}`);
        console.log(`CODE: ${otp}`);
        console.log('==========================================\n');
    }

    try {
        await sendEmail({
            email: user.email,
            subject: 'Login Verification OTP',
            message,
        });

        ApiResponse.success(
            null,
            'A new login OTP has been sent to your email address.'
        ).send(res);
    } catch (error) {
        console.error('Resend login OTP email sending failed:', error);

        // DEVELOPMENT FALLBACK: allow testing even if SMTP is misconfigured
        if (process.env.NODE_ENV === 'development') {
            return ApiResponse.success(
                null,
                'OTP re-generated! (Check terminal / backend logs since email failed - likely SMTP settings).'
            ).send(res);
        }

        // In non-development environments, clear OTP and block login
        user.otpCode = null;
        user.otpExpiry = null;
        await user.save({ validateBeforeSave: false });

        throw ApiError.internal('Failed to resend login OTP. Please check your SMTP settings.');
    }
});

// ==================== REFRESH TOKEN ====================

/**
 * @desc    Refresh access token using refresh token cookie
 * @route   POST /api/auth/refresh-token
 * @access  Public (requires valid refresh token cookie)
 */
export const refreshTokenHandler = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken;

    if (!incomingRefreshToken) {
        throw ApiError.unauthorized('Refresh token not found. Please login again.');
    }

    // Verify refresh token
    let decoded;
    try {
        decoded = verifyRefreshToken(incomingRefreshToken);
    } catch (error) {
        throw ApiError.unauthorized('Invalid or expired refresh token. Please login again.');
    }

    // Find user with stored refresh token
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user) {
        throw ApiError.unauthorized('User not found. Please login again.');
    }

    // Verify token matches stored token (prevents reuse of old tokens)
    if (user.refreshToken !== incomingRefreshToken) {
        throw ApiError.unauthorized('Refresh token has been revoked. Please login again.');
    }

    // Check if account is still active
    if (!user.isActive) {
        throw ApiError.forbidden('Your account has been deactivated.');
    }

    // Generate new token pair (token rotation)
    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);

    // Update stored refresh token
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    ApiResponse.success(
        { accessToken },
        'Token refreshed successfully'
    ).send(res);
});

// ==================== GET ME (CURRENT USER) ====================

/**
 * @desc    Get current authenticated user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    ApiResponse.success(
        { user: user.getPublicProfile() },
        'User profile retrieved'
    ).send(res);
});

// ==================== LOGOUT ====================

/**
 * @desc    Logout user — clear refresh token
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (req, res) => {
    // Remove refresh token from DB
    await User.findByIdAndUpdate(req.user.id, {
        $unset: { refreshToken: 1 },
    });

    // Clear refresh token cookie
    res.cookie('refreshToken', '', {
        httpOnly: true,
        expires: new Date(0),
        path: '/',
    });

    ApiResponse.success(null, 'Logged out successfully').send(res);
});

// ==================== CHANGE PASSWORD ====================

/**
 * @desc    Change password for authenticated user
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        throw ApiError.badRequest('Current password is incorrect');
    }

    // Check if new password is same as old
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
        throw ApiError.badRequest('New password must be different from current password');
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    ApiResponse.success(null, 'Password changed successfully').send(res);
});

// ==================== UPDATE PROFILE ====================

/**
 * @desc    Update authenticated user profile
 * @route   PUT /api/auth/update-profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, avatar } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        throw ApiError.notFound('User not found');
    }

    // Only update fields that are provided in the request
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    try {
        await user.save();

        ApiResponse.success(
            { user: user.getPublicProfile() },
            'Profile updated successfully'
        ).send(res);
    } catch (error) {
        if (error.code === 11000) {
            throw ApiError.conflict('Email address is already in use');
        }
        throw error;
    }
});

// ==================== FORGOT PASSWORD ====================

/**
 * @desc    Send OTP for password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        throw ApiError.notFound('There is no user with that email address.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });

    // Send email
    const message = `Your password reset OTP is ${otp}. It is valid for 10 minutes.`;

    // ALWAYS log to console in development so you can find the code easily
    if (process.env.NODE_ENV === 'development') {
        console.log('\n==========================================');
        console.log(`PASSWORD RESET OTP FOR: ${user.email}`);
        console.log(`CODE: ${otp}`);
        console.log('==========================================\n');
    }

    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset OTP',
            message,
        });

        ApiResponse.success(null, 'OTP sent to your email address.').send(res);
    } catch (error) {
        console.error('Email sending failed:', error);

        // DEVELOPMENT FALLBACK: If we are in development, don't show error to user
        // so they can still test using the code from the terminal
        if (process.env.NODE_ENV === 'development') {
            return ApiResponse.success(
                { otp }, // Send it in data for auto-fill or console check
                'OTP generated! (Check terminal since email failed - likely SMTP settings)'
            ).send(res);
        }

        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpires = undefined;
        await user.save({ validateBeforeSave: false });

        throw ApiError.internal('Failed to send email. Please check your SMTP settings.');
    }
});

// ==================== VERIFY OTP ====================

/**
 * @desc    Verify OTP
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const user = await User.findOne({
        email,
        resetPasswordOTP: otp,
        resetPasswordOTPExpires: { $gt: Date.now() },
    });

    if (!user) {
        throw ApiError.unauthorized('OTP is invalid or has expired.');
    }

    ApiResponse.success(null, 'OTP verified.').send(res);
});

// ==================== RESET PASSWORD ====================

/**
 * @desc    Reset password using email and OTP
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, password } = req.body;

    const user = await User.findOne({
        email,
        resetPasswordOTP: otp,
        resetPasswordOTPExpires: { $gt: Date.now() },
    });

    if (!user) {
        throw ApiError.unauthorized('OTP is invalid or has expired.');
    }

    // Set new password
    user.password = password;
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    await user.save();

    ApiResponse.success(null, 'Password reset successful.').send(res);
});
