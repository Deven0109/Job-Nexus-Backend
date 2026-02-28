/**
 * Application-wide constants
 */

export const USER_ROLES = {
    CANDIDATE: 'candidate',
    RECRUITER: 'recruiter',
    EMPLOYER: 'employer',
    ADMIN: 'admin',
};

export const JOB_STATUS = {
    DRAFT: 'draft',
    OPEN: 'open',
    PAUSED: 'paused',
    CLOSED: 'closed',
    FILLED: 'filled',
};

export const JOB_TYPES = {
    FULL_TIME: 'full-time',
    PART_TIME: 'part-time',
    CONTRACT: 'contract',
    INTERNSHIP: 'internship',
    FREELANCE: 'freelance',
};

export const EXPERIENCE_LEVELS = {
    ENTRY: 'entry',
    MID: 'mid',
    SENIOR: 'senior',
    LEAD: 'lead',
    EXECUTIVE: 'executive',
};

export const APPLICATION_STATUS = {
    APPLIED: 'applied',
    SCREENING: 'screening',
    SHORTLISTED: 'shortlisted',
    SUBMITTED_TO_EMPLOYER: 'submitted_to_employer',
    INTERVIEWING: 'interviewing',
    OFFERED: 'offered',
    HIRED: 'hired',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn',
};

export const INTERVIEW_STATUS = {
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    RESCHEDULED: 'rescheduled',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_SHOW: 'no-show',
};

export const INTERVIEW_TYPES = {
    PHONE: 'phone',
    VIDEO: 'video',
    IN_PERSON: 'in-person',
    TECHNICAL: 'technical',
    PANEL: 'panel',
};

export const OFFER_STATUS = {
    DRAFT: 'draft',
    SENT: 'sent',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn',
    EXPIRED: 'expired',
};

export const EMPLOYER_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    SUSPENDED: 'suspended',
};

export const NOTIFICATION_TYPES = {
    APPLICATION_RECEIVED: 'application_received',
    APPLICATION_STATUS_CHANGED: 'application_status_changed',
    INTERVIEW_SCHEDULED: 'interview_scheduled',
    INTERVIEW_REMINDER: 'interview_reminder',
    OFFER_RECEIVED: 'offer_received',
    OFFER_ACCEPTED: 'offer_accepted',
    OFFER_REJECTED: 'offer_rejected',
    EMPLOYER_FEEDBACK: 'employer_feedback',
    JOB_CLOSED: 'job_closed',
    NEW_CANDIDATE: 'new_candidate',
    STAGE_CHANGE: 'stage_change',
    SYSTEM: 'system',
};

export const SALARY_PERIODS = {
    HOURLY: 'hourly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
};

export const AVAILABILITY = {
    IMMEDIATE: 'immediate',
    FIFTEEN_DAYS: '15days',
    THIRTY_DAYS: '30days',
    SIXTY_DAYS: '60days',
    NINETY_DAYS: '90days',
};

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export const ALLOWED_FILE_TYPES = {
    RESUME: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
};

export const MAX_FILE_SIZE = {
    RESUME: 5 * 1024 * 1024, // 5MB
    IMAGE: 2 * 1024 * 1024,  // 2MB
};

export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
};

export const AUDIT_ACTIONS = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    STAGE_CHANGE: 'STAGE_CHANGE',
    STATUS_CHANGE: 'STATUS_CHANGE',
    OFFER_SENT: 'OFFER_SENT',
    OFFER_RESPONSE: 'OFFER_RESPONSE',
};
