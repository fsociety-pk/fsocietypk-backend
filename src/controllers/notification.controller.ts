import { Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

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
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, 'Unauthorized', null));
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json(new ApiResponse(404, 'Notification not found', null));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          'Notification marked as read',
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

    await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, 'All notifications marked as read', null)
      );
  }),

  // Delete notification
  deleteNotification: asyncHandler(async (req: Request, res: Response) => {
    const { notificationId } = req.params;
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

    await Notification.deleteMany({ userId });

    return res
      .status(200)
      .json(new ApiResponse(200, 'All notifications cleared', null));
  }),
};
