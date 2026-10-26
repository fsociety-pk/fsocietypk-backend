import { isStaff } from '../utils/roles';
import { enqueuePlatformEmail } from '../utils/platformEmail';
import logger from '../utils/logger';
import { Request, Response } from 'express';
import { Announcement } from '../models/Announcement';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { getIO } from '../socket';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { adminAnnouncementSchema, adminIdSchema } from '../schemas/admin.schema';

/**
 * @desc    Create a new announcement
 * @route   POST /api/v1/admin/announcements
 * @access  Private/Admin
 */
export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const parsed = adminAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid announcement', parsed.error.issues);
  const { title, message, targetRole } = parsed.data;

  if (!title || !message) {
    throw ApiError.badRequest('Title and message are required');
  }



  const announcement = await Announcement.create({
    adminId: req.user!._id,
    title,
    message,
    targetRole: targetRole || 'all'
  });
  let emailsQueued = false;
  try { await enqueuePlatformEmail(`announcement:${announcement._id}`, announcement.targetRole || 'all', title, `${message}\n\n— Fsociety PK\nSent to your registered account email.`); emailsQueued = true; }
  catch { logger.error('Announcement created, but email queueing failed. Restore it to retry.'); }

  // Only notify the audience selected for this announcement.
  const audienceFilter = announcement.targetRole === 'all' ? { isBanned: false } : { isBanned: false, role: announcement.targetRole === 'staff' ? { $ne: 'user' } : announcement.targetRole };
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

  res.status(201).json(ApiResponse.created('Announcement created and broadcasted successfully', { ...announcement.toObject(), emailsQueued }));
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
    targetRole: { $in: ['all', req.user!.role, ...(isStaff(req.user!.role) ? ['staff'] : [])] },
  })
    .sort({ createdAt: -1 })
    .limit(10);

  res.status(200).json(ApiResponse.ok('Active announcements retrieved successfully', announcements));
});

export const updateAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  if (!adminIdSchema.safeParse(req.params.id).success || typeof req.body.isActive !== 'boolean' || Object.keys(req.body).some(key => key !== 'isActive')) {
    throw ApiError.badRequest('Provide an announcement ID and an isActive boolean');
  }
  const announcement = await Announcement.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true, runValidators: true });
  if (!announcement) throw ApiError.notFound('Announcement not found');
  let emailsQueued = false;
  if (announcement.isActive) {
    try { await enqueuePlatformEmail(`announcement:${announcement._id}`, announcement.targetRole || 'all', announcement.title, `${announcement.message}\n\n— Fsociety PK\nSent to your registered account email.`); emailsQueued = true; }
    catch { logger.error('Announcement restored, but email queueing failed.'); }
  }
  res.json(ApiResponse.ok('Announcement updated', { ...announcement.toObject(), ...(announcement.isActive ? { emailsQueued } : {}) }));
});
