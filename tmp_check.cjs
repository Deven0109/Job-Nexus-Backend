const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const checkDb = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        for (const collName of ['users', 'candidates', 'employers']) {
            const coll = mongoose.connection.db.collection(collName);
            const indexes = await coll.indexes();
            console.log(`\nIndexes for ${collName}:`);
            console.log(JSON.stringify(indexes, null, 2));

            // Check for itfuturz@gmail.com
            const emailField = collName === 'employers' ? 'companyEmail' : 'email';
            const docs = await coll.find({ [emailField]: 'itfuturz@gmail.com' }).toArray();
            console.log(`Docs in ${collName} with itfuturz@gmail.com:`, docs.length);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkDb();
