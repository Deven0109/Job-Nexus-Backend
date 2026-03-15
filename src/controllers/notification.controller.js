import Notification from '../models/Notification.model.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { buildPagination, paginationMeta } from '../utils/helpers.js';

/**
 * @desc    Get user notifications with pagination and filter
 * @route   GET /api/notifications
 * @access  Private
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req.query);
  const { filter } = req.query; // 'unread' or 'all'

  let query = { user: req.user.id };
  
  if (filter === 'unread') {
    query.isRead = false;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'firstName lastName avatar'),
    Notification.countDocuments(query)
  ]);

  ApiResponse.success(
    { 
      notifications,
      pagination: paginationMeta(total, page, limit)
    },
    'Notifications retrieved successfully'
  ).send(res);
});

/**
 * @desc    Get unread notifications count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ 
    user: req.user.id, 
    isRead: false 
  });

  ApiResponse.success(
    { count },
    'Unread count retrieved'
  ).send(res);
});

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  ApiResponse.success(
    { notification },
    'Notification marked as read'
  ).send(res);
});

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/notifications/mark-all-read
 * @access  Private
 */
export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { isRead: true }
  );

  ApiResponse.success(
    null,
    'All notifications marked as read'
  ).send(res);
});

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ 
    _id: req.params.id, 
    user: req.user.id 
  });

  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  ApiResponse.success(
    null,
    'Notification deleted'
  ).send(res);
});
