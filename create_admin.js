const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect('mongodb://localhost:27017/job-consultancy').then(async () => {
    const db = mongoose.connection.db;
    const hashedPassword = await bcrypt.hash('password123', 10);
    await db.collection('users').updateOne(
        { email: 'superadmin@example.com' },
        {
            $set: {
                firstName: 'Super',
                lastName: 'Admin',
                email: 'superadmin@example.com',
                password: hashedPassword,
                role: 'admin',
                isActive: true
            }
        },
        { upsert: true }
    );
    console.log('Admin user created');
    process.exit(0);
}).catch(console.error);
