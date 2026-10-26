import { Router } from 'express';
import * as resourceController from '../controllers/resource.controller';
import { protect, restrictTo, requirePermission } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', resourceController.getApprovedResources);
router.get('/category/:category', resourceController.getResourcesByCategory);

// Protected routes
router.use(protect);
router.post('/', restrictTo('user'), resourceController.submitResource);
router.get('/my-submissions', resourceController.getMyResources);

// Admin routes
router.use(requirePermission('reviews'));
router.get('/admin/pending', resourceController.getPendingResources);
router.patch('/:id/approve', resourceController.approveResource);
router.delete('/:id', resourceController.deleteResource);

export default router;
