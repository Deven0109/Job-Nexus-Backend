import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import RecruiterCategory from '../models/RecruiterCategory.model.js';
import { emitToUser } from '../socket.js';

/**
 * Create and send a notification to a specific user
 */
export const createNotification = async (payload) => {
  try {
    const { user, role, type, title, message, sender, jobRequestId, jobId, applicationId, interviewId, route } = payload;

    const notification = await Notification.create({
      user,
      role,
      type,
      title,
      message,
      sender,
      jobRequestId,
      jobId,
      applicationId,
      interviewId,
      route
    });

    // Emit real-time notification via Socket.IO
    emitToUser(user, 'notification:new', notification);

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

/**
 * Notify recruiters matched by both Category and Job Title
 */
export const notifyMatchedRecruiters = async (category, jobTitle, payload) => {
  try {
    // Find recruiters whose managed categories include this category AND managed job titles include this job title
    const mappings = await RecruiterCategory.find({
      categoryName: category,
      selectedJobTitles: jobTitle // Mongoose matches if the string exists in the array
    });

    const recruiterIds = mappings.map(m => m.recruiterId);

    if (recruiterIds.length === 0) {
      console.log(`No recruiters matched for Category: ${category}, Job Title: ${jobTitle}`);
      return [];
    }

    const notifications = await Promise.all(
      recruiterIds.map(recruiterId =>
        createNotification({
          ...payload,
          user: recruiterId,
          role: 'recruiter'
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('Error in notifyMatchedRecruiters:', error);
  }
};

/**
 * Notify all recruiters responsible for a specific job
 */
export const notifyJobRecruiters = async (jobId, payload) => {
  try {
    const Job = (await import('../models/Job.model.js')).default;
    const job = await Job.findById(jobId);
    if (!job) return;

    const recruitersToNotify = new Set();

    if (job.createdByRecruiter) {
      recruitersToNotify.add(job.createdByRecruiter.toString());
    }

    // Also notify based on category AND job title match
    const mappings = await RecruiterCategory.find({
      categoryName: job.category,
      selectedJobTitles: job.title
    });

    mappings.forEach(m => recruitersToNotify.add(m.recruiterId.toString()));

    const notifications = await Promise.all(
      Array.from(recruitersToNotify).map(recruiterId =>
        createNotification({
          ...payload,
          user: recruiterId,
          role: 'recruiter'
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('Error in notifyJobRecruiters:', error);
  }
};

/**
 * Notify all active candidates
 */
export const notifyAllCandidates = async (payload) => {
  try {
    const candidates = await User.find({ role: 'candidate', isActive: true }).select('_id');

    const notifications = await Promise.all(
      candidates.map(candidate =>
        createNotification({
          ...payload,
          user: candidate._id,
          role: 'candidate'
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('Error in notifyAllCandidates:', error);
  }
};
/**
 * Notify all admins
 */
export const notifyAdmins = async (payload) => {
  try {
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id');

    const notifications = await Promise.all(
      admins.map(admin =>
        createNotification({
          ...payload,
          user: admin._id,
          role: 'admin'
        })
      )
    );

    return notifications;
  } catch (error) {
    console.error('Error in notifyAdmins:', error);
  }
};
