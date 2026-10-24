import { Request, Response } from 'express';
import { Announcement } from '../models/Announcement';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { getIO } from '../socket';
import { User } from '../models/User';
import { Notification } from '../models/Notification';

/**
 * @desc    Create a new announcement
 * @route   POST /api/v1/admin/announcements
 * @access  Private/Admin
 */
export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { title, message, targetRole } = req.body;

  if (!title || !message) {
    throw ApiError.badRequest('Title and message are required');
  }

  if (!['all', 'user', 'admin'].includes(targetRole || 'all')) {
    throw ApiError.badRequest('Target role must be all, user, or admin');
  }

  const announcement = await Announcement.create({
    adminId: req.user!._id,
    title,
    message,
    targetRole: targetRole || 'all'
  });

  // Only notify the audience selected for this announcement.
  const audienceFilter = announcement.targetRole === 'all' ? {} : { role: announcement.targetRole };
  const users = await User.find(audienceFilter).select('_id');
  const notificationsToInsert = users.map((u: any) => ({
    userId: u._id,
    title: `Platform Announcement: ${title}`,
    message: message,
    type: 'system',
    read: false
  }));
  if (notificationsToInsert.length > 0) {
    await Notification.insertMany(notificationsToInsert);
  }

  // Socket connections are currently public, so only broadcast announcements
  // intended for everyone. Role-targeted items remain available via the API.
  if (announcement.targetRole === 'all') {
    getIO().emit('newAnnouncement', {
      _id: announcement._id,
      title: announcement.title,
      message: announcement.message,
      createdAt: announcement.createdAt
    });
  }

  res.status(201).json(ApiResponse.created('Announcement created and broadcasted successfully', announcement));
});

/**
 * @desc    Get all announcements (for admin management)
 * @route   GET /api/v1/admin/announcements
 * @access  Private/Admin
 */
export const getAnnouncements = asyncHandler(async (_req: Request, res: Response) => {
  const announcements = await Announcement.find()
    .populate('adminId', 'username')
    .sort({ createdAt: -1 });

  res.status(200).json(ApiResponse.ok('Announcements retrieved successfully', announcements));
});

/**
 * @desc    Get active announcements (for users)
 * @route   GET /api/v1/announcements
 * @access  Private
 */
export const getActiveAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const announcements = await Announcement.find({
    isActive: true,
    targetRole: { $in: ['all', req.user!.role] },
  })
    .sort({ createdAt: -1 })
    .limit(10);

  res.status(200).json(ApiResponse.ok('Active announcements retrieved successfully', announcements));
});
