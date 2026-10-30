import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { notificationController } from '../controllers/notification.controller';

const router = Router();

// All routes require authentication
router.use(protect);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// Get all notifications (with optional read filter)
router.get('/', notificationController.getNotifications);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark specific notification as read
router.patch('/:notificationId/read', notificationController.markAsRead);

// Mark all notifications as read
router.patch('/read/all', notificationController.markAllAsRead);

// Delete specific notification
router.delete('/:notificationId', notificationController.deleteNotification);

// Clear all notifications
router.delete('/', notificationController.clearAll);

export default router;
