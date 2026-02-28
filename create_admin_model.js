import mongoose from 'mongoose';
import User from './src/models/User.model.js';
import config from './src/config/env.js';

mongoose.connect(config.mongoUri).then(async () => {
    let user = await User.findOne({ email: 'superadmin@example.com' });
    if (!user) {
        user = new User({
            firstName: 'Super',
            lastName: 'Admin',
            email: 'superadmin@example.com',
            password: 'password123',
            role: 'admin',
            isActive: true
        });
        await user.save();
        console.log('Admin user created');
    } else {
        user.password = 'password123';
        user.role = 'admin';
        await user.save();
        console.log('Admin user updated');
    }
    process.exit(0);
}).catch(console.error);
