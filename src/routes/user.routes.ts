import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Protected routes (Specific routes first with explicit middleware)
router.get('/me/profile', protect, userController.getProfile);
router.put('/me/profile', protect, userController.updateProfile);
router.post('/me/change-password', protect, userController.changePassword);

// Public routes (Dynamic routes last)
router.get('/:username/profile', userController.getPublicProfile);

export default router;
