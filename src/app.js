import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom NoSQL injection sanitizer (express-mongo-sanitize is incompatible with Express 5)
import config from './config/env.js';
import errorHandler from './middlewares/errorHandler.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import ApiError from './utils/ApiError.js';

// Import route files
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import candidateRoutes from './routes/candidate.routes.js';
import recruiterRoutes from './routes/recruiter.routes.js';
import employerRoutes from './routes/employer.routes.js';
import jobRequestRoutes from './routes/jobRequest.routes.js';
import categoryRoutes from './routes/category.routes.js';
import applicationRoutes from './routes/application.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import faqRoutes from './routes/faq.routes.js';


const app = express();

// ==================== SECURITY MIDDLEWARE ====================

// Set security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = [
    config.clientUrl,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1 || config.env === 'development') {
                callback(null, true);
            } else {
                callback(new ApiError.forbidden('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// Sanitize data against NoSQL injection (custom middleware for Express 5 compatibility)
const sanitize = (obj) => {
    if (obj && typeof obj === 'object') {
        for (const key in obj) {
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
            } else {
                sanitize(obj[key]);
            }
        }
    }
    return obj;
};
app.use((req, res, next) => {
    if (req.body) sanitize(req.body);
    if (req.params) sanitize(req.params);
    next();
});

// Rate limiting
app.use('/api', apiLimiter);

// ==================== BODY PARSING MIDDLEWARE ====================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies
app.use(cookieParser());

// ==================== LOGGING ====================

if (config.env === 'development') {
    app.use(morgan('dev'));
}

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Job Consultancy API is running',
        environment: config.env,
        timestamp: new Date().toISOString(),
    });
});

// Serve static files from public directory
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

import jobRoutes from './routes/job.routes.js';

// ==================== API ROUTES ====================

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/job-requests', jobRequestRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/faqs', faqRoutes);


// Future route modules:
// app.use('/api/applications', applicationRoutes);
// app.use('/api/interviews', interviewRoutes);
// app.use('/api/offers', offerRoutes);
app.use('/api/notifications', notificationRoutes);
// app.use('/api/reports', reportRoutes);

// ==================== 404 HANDLER ====================

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// Fallback for SPA (HashRouter uses index.html as anchor)
app.get('/*any', (req, res, next) => {
    // If it's an API route, let it fall through to 404
    if (req.url.startsWith('/api')) return next();
    
    // Serve admin frontend for /admin routes
    if (req.url.startsWith('/admin')) {
        return res.sendFile(path.join(__dirname, '../public/admin/index.html'));
    }
    
    // Serve main frontend for all other routes
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((req, res, next) => {
    next(ApiError.notFound(`Route ${req.originalUrl} not found`));
});

// ==================== GLOBAL ERROR HANDLER ====================

app.use(errorHandler);

export default app;
