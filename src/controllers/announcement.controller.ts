import { Request, Response } from 'express';
import { Announcement } from '../models/Announcement';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { getIO } from '../socket';

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

  const announcement = await Announcement.create({
    adminId: req.user!._id,
    title,
    message,
    targetRole: targetRole || 'all'
  });

  // Emit socket event for real-time notification
  const io = getIO();
  io.emit('newAnnouncement', {
    _id: announcement._id,
    title: announcement.title,
    message: announcement.message,
    createdAt: announcement.createdAt
  });

  res.status(201).json(ApiResponse.created('Announcement created successfully', announcement));
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
export const getActiveAnnouncements = asyncHandler(async (_req: Request, res: Response) => {
  const announcements = await Announcement.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(10);

  res.status(200).json(ApiResponse.ok('Active announcements retrieved successfully', announcements));
});
