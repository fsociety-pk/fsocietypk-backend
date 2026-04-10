import { Router } from 'express';
import * as adminProfileController from '../controllers/adminProfile.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateAdminProfileSchema } from '../schemas/profile.schema';

const router = Router();

// GET profile is available to all logged-in operatives
router.get('/', protect, adminProfileController.getAdminProfile);

// PUT profile is restricted to admins only
router.put('/', protect, restrictTo('admin'), validate(updateAdminProfileSchema), adminProfileController.updateAdminProfile);

export default router;
