import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as analyticsController from '../controllers/admin.analytics.controller';
import * as announcementController from '../controllers/announcement.controller';
import * as resourceController from '../controllers/resource.controller';
import { protect, requirePermission, requireStaff } from '../middleware/auth.middleware';
import { createChallenge } from '../controllers/challenge.controller';
import { uploadChallengeAttachments } from '../middleware/challengeUpload.middleware';
import * as contentController from '../controllers/admin.content.controller';
import { adminIdSchema } from '../schemas/admin.schema';
import { ApiError } from '../utils/ApiError';
import * as systemController from '../controllers/admin.system.controller';

const router = Router();

// Secure all admin routes
router.use(protect);
router.use(requireStaff);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.param('id', (_req, _res, next, id) => {
  if (!adminIdSchema.safeParse(id).success) return next(ApiError.badRequest('Invalid administration record ID'));
  next();
});

// System Stats & Analytics
router.get('/stats', requirePermission('overview'), adminController.getStats);
router.get('/analytics', requirePermission('analytics'), analyticsController.getAnalytics);
router.get('/system/status', requirePermission('system'), systemController.getSystemStatus);
router.post('/system/email-test', requirePermission('system'), systemController.testEmail);
router.post('/system/email-retry', requirePermission('system'), systemController.retryEmails);

// Announcements
router.post('/announcements', requirePermission('announcements'), announcementController.createAnnouncement);
router.get('/announcements', requirePermission('announcements'), announcementController.getAnnouncements);
router.patch('/announcements/:id', requirePermission('announcements'), announcementController.updateAnnouncement);

// Resources Management
router.get('/resources/pending', requirePermission('reviews'), resourceController.getPendingResources);
router.get('/resources', requirePermission('reviews'), contentController.getResources);
router.get('/writeups', requirePermission('reviews'), contentController.getWriteups);
router.patch('/resources/:id/approve', requirePermission('reviews'), resourceController.approveResource);
router.delete('/resources/:id', requirePermission('reviews'), resourceController.deleteResource);

// User Management
router.get('/users', adminController.getUsers);
router.patch('/users/:id/ban', requirePermission('members'), adminController.toggleBan);
router.patch('/users/:id/role', requirePermission('roles'), adminController.updateRole);

// Challenge Management (review queue)
router.get('/challenges', requirePermission('challenges.read'), adminController.getChallenges);
router.post('/challenges', requirePermission('challenges.write'), uploadChallengeAttachments, createChallenge);
router.get('/challenges/:id', requirePermission('challenges.read'), adminController.getChallenge);
router.patch('/challenges/:id', requirePermission('challenges.write'), adminController.updateChallenge);
router.patch('/challenges/:id/status', requirePermission('challenges.review'), adminController.updateChallengeStatus);
router.patch('/challenges/:id/live-status', requirePermission('challenges.review'), adminController.updateChallengeLiveStatus);
router.delete('/challenges/:id', requirePermission('challenges.write'), adminController.deleteChallenge);

export default router;
