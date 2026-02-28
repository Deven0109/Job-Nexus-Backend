import nodemailer from 'nodemailer';
import config from '../config/env.js';

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Email body
 */
const sendEmail = async (options) => {
    if (!config.email.user || !config.email.pass) {
        throw new Error(
            'SMTP is not configured. Please set SMTP_USER and SMTP_PASS (Gmail App Password) in Backend/.env'
        );
    }

    // 1) Create a transporter
    const isGmail = config.email.host?.includes('gmail');
    const transporter = nodemailer.createTransport(
        isGmail
            ? {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: config.email.user,
                    pass: config.email.pass, // Gmail App Password
                },
            }
            : {
                host: config.email.host,
                port: config.email.port,
                secure: config.email.port === 465,
                auth: {
                    user: config.email.user,
                    pass: config.email.pass,
                },
            }
    );

    // 2) Define the email options
    // For Gmail SMTP the "from" must match the authenticated user
    const fromAddress = isGmail ? config.email.user : (config.email.from || config.email.user);

    const mailOptions = {
        from: `${config.email.fromName} <${fromAddress}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html || `<div style="font-family: Arial, sans-serif; padding: 20px;">${options.message.replace(/\n/g, '<br/>')}</div>`,
    };

    // 3) Actually send the email
    try {
        const info = await transporter.sendMail(mailOptions);
        if (process.env.NODE_ENV === 'development') {
            console.log('Email sent:', {
                to: options.email,
                subject: options.subject,
                messageId: info.messageId,
                response: info.response,
            });
        }
    } catch (error) {
        console.error('Primary SMTP failed, falling back to Ethereal Testing SMTP:', error.message);

        // DEVELOPMENT FALLBACK: If Google blocks the password, use a temporary Ethereal account
        if (process.env.NODE_ENV === 'development') {
            const testAccount = await nodemailer.createTestAccount();
            const fallbackTransporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });

            const fallbackInfo = await fallbackTransporter.sendMail({
                from: '"Job Consultancy Fallback" <test@ethereal.email>',
                to: options.email,
                subject: options.subject,
                text: options.message,
            });

            console.log('\n==========================================');
            console.log('⚠️ GOOGLE SMTP AUTH FAILED!');
            console.log('💡 USING ETHEREAL FALLBACK FOR TESTING');
            console.log(`📩 FAST OTP PREVIEW LINK: ${nodemailer.getTestMessageUrl(fallbackInfo)}`);
            console.log('==========================================\n');
        } else {
            throw error;
        }
    }
};

export default sendEmail;
