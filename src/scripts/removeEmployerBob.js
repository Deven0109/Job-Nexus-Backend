import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.model.js';
import Employer from '../models/Employer.model.js';
import config from '../config/env.js';

dotenv.config();

const removeEmployerBob = async () => {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find user named Bob with employer role
        const user = await User.findOne({
            $or: [{ firstName: /Bob/i }, { lastName: /Bob/i }],
            role: 'employer'
        });

        if (!user) {
            console.log('❌ Employer Bob not found');
            return;
        }

        console.log(`🔍 Found Bob: ${user.firstName} ${user.lastName} (${user.email})`);

        // Remove from Employer model
        await Employer.deleteOne({ userId: user._id });
        console.log('✅ Removed from Employer profiles');

        // Remove from User model
        await User.deleteOne({ _id: user._id });
        console.log('✅ Removed from Users collection');

        console.log('─────────────────────────────────');
        console.log('SUCCESS: Employer Bob has been removed');
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

removeEmployerBob();
