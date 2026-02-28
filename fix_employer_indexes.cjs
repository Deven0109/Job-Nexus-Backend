const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const fixIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const employers = mongoose.connection.db.collection('employers');

        console.log('Checking indexes for employers...');
        const indexes = await employers.indexes();

        const indexesToDrop = ['user_1', 'companyName_1'];

        for (const idxName of indexesToDrop) {
            if (indexes.find(i => i.name === idxName)) {
                console.log(`Dropping index: ${idxName}`);
                await employers.dropIndex(idxName);
            }
        }

        console.log('Index cleanup complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error during index cleanup:', err);
        process.exit(1);
    }
};

fixIndexes();
