import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './src/models/User.model.js';
import Candidate from './src/models/Candidate.model.js';
import Employer from './src/models/Employer.model.js';
import config from './src/config/env.js';
import { USER_ROLES } from './src/utils/constants.js';

dotenv.config();

const URI = config.mongoUri || config.mongodbUri || 'mongodb://localhost:27017/job-consultancy';

const connectDB = async () => {
    try {
        await mongoose.connect(URI);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const commands = {
    activateAdmin: async () => {
        await connectDB();
        const collection = mongoose.connection.collection('users');
        const allUsers = await collection.find({}).toArray();
        console.log('--- ALL USERS IN DB ---');
        allUsers.forEach(u => console.log(`Email: [${u.email}] | Role: ${u.role} | IsActive: ${u.isActive} | ID: ${u._id}`));
        const result = await collection.updateMany({ role: 'admin' }, { $set: { isActive: true } });
        console.log(`Updated ${result.modifiedCount} admin(s) to active.`);
    },
    checkEmail: async () => {
        await connectDB();
        const allUsers = await User.find({});
        console.log('Total count:', allUsers.length);
        allUsers.forEach(u => console.log(`- ID: ${u._id} | Email: ${u.email} | Role: ${u.role}`));
    },
    checkRoles: async () => {
        await connectDB();
        const roles = await User.distinct('role');
        console.log('Roles in DB:', roles);
        const counts = {};
        for (const role of roles) counts[role] = await User.countDocuments({ role });
        console.log('Counts:', counts);
    },
    debugUsers: async () => {
        await connectDB();
        const users = await User.find({}, 'firstName lastName email role isActive');
        console.log('--- USER LIST ---');
        console.table(users.map(u => u.toObject()));
        const admin = await User.findOne({ email: 'admin@jobconsult.com' }).select('+password');
        if (admin) {
            console.log(`Admin found: ${admin.email} | Role: ${admin.role} | Has password hash: ${!!admin.password}`);
        } else {
            console.log('Admin NOT FOUND: admin@jobconsult.com');
        }
    },
    emergencyFix: async () => {
        await connectDB();
        await User.deleteMany({ email: 'admin@jobconsult.com' });
        const salt = await bcrypt.genSalt(12);
        const password = await bcrypt.hash('Admin@123456', salt);
        await User.create({ firstName: 'ADMIN', email: 'admin@jobconsult.com', password, role: 'admin', isActive: true });
        console.log('Fixed admin user successfully');
    },
    finalFixAdmin: async () => {
        await connectDB();
        const collection = mongoose.connection.collection('users');
        const before = await collection.find({}).toArray();
        console.log('--- BEFORE ---');
        before.forEach(u => console.log(`[${u.email}] - Role: ${u.role} - Active: ${u.isActive}`));

        await collection.deleteMany({ email: 'admin@jobconsult.com' });
        console.log('Deleted existing admin.');

        const salt = await bcrypt.genSalt(12);
        const password = await bcrypt.hash('Admin@123456', salt);
        const insertResult = await collection.insertOne({
            firstName: 'ADMIN',
            email: 'admin@jobconsult.com',
            password,
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('Admin inserted:', insertResult.insertedId);

        const after = await collection.find({}).toArray();
        console.log('--- AFTER ---');
        after.forEach(u => console.log(`[${u.email}] - Role: ${u.role} - Active: ${u.isActive}`));
    },
    resetAdmin: async () => {
        await connectDB();
        await User.deleteOne({ email: 'admin@jobconsult.com' });
        console.log('Deleted existing admin if any');
        await User.create({
            firstName: 'ADMIN',
            email: 'admin@jobconsult.com',
            password: 'Admin@123456',
            role: 'admin',
            isActive: true,
            isEmailVerified: true,
        });
        console.log('Admin created successfully with password: Admin@123456');
    },
    seedTestUsers: async () => {
        await connectDB();
        await User.deleteMany({ role: { $ne: 'admin' } });
        console.log('Cleared non-admin users');
        const salt = await bcrypt.genSalt(12);
        const password = await bcrypt.hash('Password123!', salt);
        const users = [
            { firstName: 'John', lastName: 'Candidate', email: 'candidate@test.com', password, role: 'candidate', isActive: true, isEmailVerified: true, phone: '1234567890' },
            { firstName: 'Jane', lastName: 'Recruiter', email: 'recruiter@test.com', password, role: 'recruiter', isActive: true, isEmailVerified: true, phone: '0987654321' },
            { firstName: 'Bob', lastName: 'Employer', email: 'employer@test.com', password, role: 'employer', isActive: true, isEmailVerified: true, phone: '5555555555' }
        ];
        await User.insertMany(users);
        console.log('Added 3 test users (Candidate, Recruiter, Employer)');
    },
    syncProfiles: async () => {
        await connectDB();
        const users = await User.find();
        console.log(`Checking ${users.length} users...`);
        let candidateCount = 0; let employerCount = 0;
        for (const user of users) {
            if (user.role === USER_ROLES.CANDIDATE) {
                await Candidate.findOneAndUpdate({ user: user._id }, { $set: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone } }, { upsert: true });
                candidateCount++;
            } else if (user.role === USER_ROLES.EMPLOYER) {
                await Employer.findOneAndUpdate({ user: user._id }, { $set: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone } }, { upsert: true });
                employerCount++;
            }
        }
        console.log(`Synced ${candidateCount} Candidate documents\nSynced ${employerCount} Employer documents`);
    },
    testApi: async () => {
        console.log('Signing in...');
        try {
            const loginRes = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@jobconsult.com', password: 'Admin@123456' })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) throw new Error(loginData.message || 'Login failed');
            const token = loginData.data.accessToken;
            console.log('Login successful. Token obtained.');
            const endpoints = ['/api/admin/stats', '/api/admin/recruiters', '/api/admin/candidates', '/api/admin/employers'];
            for (const endpoint of endpoints) {
                console.log(`Testing ${endpoint}...`);
                const res = await fetch(`http://localhost:5000${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (res.ok) {
                    console.log(`✅ ${endpoint}: Success (${res.status})`);
                    if (data.data) {
                        const firstKey = Object.keys(data.data)[0];
                        if (firstKey && Array.isArray(data.data[firstKey])) {
                            console.log(`   Items in ${firstKey}: ${data.data[firstKey].length}`);
                        }
                    }
                } else {
                    console.error(`❌ ${endpoint}: Failed (${res.status}) - ${data.message || 'Unknown error'}`);
                }
            }
        } catch (err) { console.error('Test failed:', err.message); }
    },
    testRecruiters: async () => {
        try {
            const loginRes = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@jobconsult.com', password: 'Admin@123456' })
            });
            const loginData = await loginRes.json();
            const token = loginData.data.accessToken;
            const res = await fetch('http://localhost:5000/api/admin/recruiters', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            console.log('RECRUITERS RESPONSE:', JSON.stringify(data, null, 2));
        } catch (err) { console.error(err); }
    },
    updateAdminName: async () => {
        await connectDB();
        const result = await User.updateOne(
            { email: 'admin@jobconsult.com' },
            { firstName: 'Admin', lastName: '' }
        );
        if (result.modifiedCount > 0) console.log('Admin user name updated to "Admin"');
        else console.log('Admin user not found or already has the name "Admin"');
    }
};

const run = async () => {
    const command = process.argv[2];
    if (!command || !commands[command]) {
        console.log('Usage: node adminTools.js <command>');
        console.log('Available commands: \n  - ' + Object.keys(commands).join('\n  - '));
        process.exit(1);
    }

    console.log(`Running: ${command}\n----------------------------------`);
    try {
        await commands[command]();
    } catch (err) {
        console.error('Execution Error:', err);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit();
    }
};

run();
