/**
 * Admin Seeder Script
 * ─────────────────────────────────────────────────
 * Creates the first admin user directly in the database.
 * Admin accounts CANNOT be created via the public register API.
 *
 * Usage:
 *   node src/scripts/seedAdmin.js
 *
 * Environment: Requires MONGODB_URI in .env
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.model.js';
import config from '../config/env.js';

// Load env vars
dotenv.config();

const ADMIN_DATA = {
    firstName: 'Admin',
    lastName: '',
    email: 'admin@jobconsult.com',
    password: 'Admin@123456',
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
};

const seedAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(config.mongodbUri);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: ADMIN_DATA.email });

        if (existingAdmin) {
            console.log('⚠️  Admin user already exists:');
            console.log(`   Email: ${existingAdmin.email}`);
            console.log(`   Role:  ${existingAdmin.role}`);
            console.log(`   ID:    ${existingAdmin._id}`);
        } else {
            // Create admin (password is auto-hashed by pre-save hook)
            const admin = await User.create(ADMIN_DATA);
            console.log('✅ Admin user created successfully!');
            console.log('─────────────────────────────────');
            console.log(`   Name:     ${admin.firstName} ${admin.lastName}`);
            console.log(`   Email:    ${admin.email}`);
            console.log(`   Password: ${ADMIN_DATA.password}`);
            console.log(`   Role:     ${admin.role}`);
            console.log(`   ID:       ${admin._id}`);
            console.log('─────────────────────────────────');
            console.log('⚠️  IMPORTANT: Change the default password after first login!');
        }
    } catch (error) {
        console.error('❌ Error seeding admin:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
        process.exit(0);
    }
};

seedAdmin();
