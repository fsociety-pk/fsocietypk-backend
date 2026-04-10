import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as analyticsController from '../controllers/admin.analytics.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = Router();

// Secure all admin routes
router.use(protect);
router.use(restrictTo('admin'));

// System Stats & Analytics
router.get('/stats', adminController.getStats);
router.get('/analytics', analyticsController.getAnalytics);

// User Management
router.get('/users', adminController.getUsers);
router.patch('/users/:id/ban', adminController.toggleBan);

// Challenge Management (review queue)
router.get('/challenges', adminController.getChallenges);
router.patch('/challenges/:id/status', adminController.updateChallengeStatus);
router.delete('/challenges/:id', adminController.deleteChallenge);

export default router;
