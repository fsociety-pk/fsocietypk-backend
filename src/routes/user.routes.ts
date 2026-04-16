import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Public routes (Dynamic routes last)
router.get('/:username/profile', userController.getPublicProfile);

// Protected routes (Specific routes first)
router.use(protect);
router.get('/me/profile', userController.getProfile);
router.put('/me/profile', userController.updateProfile);
router.post('/me/change-password', userController.changePassword);

export default router;
