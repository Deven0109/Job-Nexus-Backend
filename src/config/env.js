import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  // MongoDB
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/job-consultancy',

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '30d',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '90d',
  },

  // Client
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Email
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.FROM_EMAIL || 'noreply@jobconsultancy.com',
    fromName: process.env.FROM_NAME || 'Job Nexus',
  },

  // AWS S3
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-south-1',
    s3Bucket: process.env.S3_BUCKET_NAME || 'job-consultancy-uploads',
  },
};

export default config;
