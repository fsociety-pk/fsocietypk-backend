import { Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { emitNotificationsChanged } from '../socket';
import { z } from 'zod';

const notificationIdSchema = z.string().regex(/^[a-f0-9]{24}$/i);
const readSchema = z.object({ read: z.boolean().optional().default(true) });
const bulkSchema = z.object({ ids: z.array(notificationIdSchema).max(10000).optional() });
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Invalid notification request');
  return result.data;
};

export const notificationController = {
  // Get all notifications for user
  getNotifications: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }
    const { read } = req.query;
    if (read !== undefined && read !== 'true' && read !== 'false') throw ApiError.badRequest('Invalid read filter');

    const filter: any = { userId };
    if (read !== undefined) {
      filter.read = read === 'true';
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .populate('challengeId', 'title');

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          'Notifications fetched successfully',
          notifications
        )
      );
  }),

  // Get unread notification count
  getUnreadCount: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }
    const count = await Notification.countDocuments({
      userId,
      read: false,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          'Unread count fetched',
          { unreadCount: count }
        )
      );
  }),

  // Mark notification as read
  markAsRead: asyncHandler(async (req: Request, res: Response) => {
    const { notificationId } = req.params;
    parse(notificationIdSchema, notificationId);
    const { read } = parse(readSchema, req.body || {});
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { read } },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json(new ApiResponse(404, 'Notification not found', null));
    }

    emitNotificationsChanged(userId);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          read ? 'Notification marked as read' : 'Notification marked as unread',
          notification
        )
      );
  }),

  // Mark all notifications as read
  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }

    const { ids } = parse(bulkSchema, req.body || {});
    await Notification.updateMany(
      { userId, read: false, ...(ids ? { _id: { $in: ids } } : {}) },
      { $set: { read: true } }
    );
    emitNotificationsChanged(userId);

    return res
      .status(200)
      .json(
        new ApiResponse(200, 'All notifications marked as read', null)
      );
  }),

  // Delete notification
  deleteNotification: asyncHandler(async (req: Request, res: Response) => {
    const { notificationId } = req.params;
    parse(notificationIdSchema, notificationId);
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return res
        .status(404)
        .json(new ApiResponse(404, 'Notification not found', null));
    }

    emitNotificationsChanged(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, 'Notification deleted', null));
  }),

  // Clear all notifications
  clearAll: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }

    const { ids } = parse(bulkSchema, req.body || {});
    await Notification.deleteMany({ userId, ...(ids ? { _id: { $in: ids } } : {}) });
    emitNotificationsChanged(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, 'All notifications cleared', null));
  }),
};
