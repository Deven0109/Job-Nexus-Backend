import app from './src/app.js';
import config from './src/config/env.js';
import connectDB from './src/config/db.js';

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Start Express server on BOTH IPv4 and IPv6 securely
        import('http').then((http) => {
            const server4 = http.createServer(app);
            server4.listen(config.port, '127.0.0.1', () => {
                console.log(`\n🚀 ==========================================`);
                console.log(`   Job Consultancy API Server`);
                console.log(`   Environment: ${config.env}`);
                console.log(`   Port: ${config.port}`);
                console.log(`   API: http://localhost:${config.port}/api`);
                console.log(`   Health: http://localhost:${config.port}/api/health`);
                console.log(`==========================================\n`);
            });

            // Prevent connection refused errors on modern Chrome by explicitly listening on ::1 (IPv6 Localhost)
            const server6 = http.createServer(app);
            server6.listen(config.port, '::1').on('error', (err) => {
                // Silently ignore if IPv6 is not supported on the host machine
                if (err.code !== 'EADDRNOTAVAIL') {
                    console.error('IPv6 binding error:', err.message);
                }
            });
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION:', err.message);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err.message);
    process.exit(1);
});

startServer();
