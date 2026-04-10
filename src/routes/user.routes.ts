import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All routes here are protected
router.use(protect);

router.get('/me/profile', userController.getProfile);
router.post('/me/change-password', userController.changePassword);

export default router;
