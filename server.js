import app from './src/app.js';
import config from './src/config/env.js';
import connectDB from './src/config/db.js';

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Create HTTP server
        import('http').then((http) => {
            const server = http.createServer(app);
            
            // Initialize Socket.IO
            import('./src/socket.js').then(({ initSocket }) => {
                initSocket(server);
            });

            server.listen(config.port, '0.0.0.0', () => {
                console.log(`\n🚀 ==========================================`);
                console.log(`   Job Consultancy API Server`);
                console.log(`   Environment: ${config.env}`);
                console.log(`   Port: ${config.port}`);
                console.log(`   API: http://localhost:${config.port}/api`);
                console.log(`   Health: http://localhost:${config.port}/api/health`);
                console.log(`==========================================\n`);
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
