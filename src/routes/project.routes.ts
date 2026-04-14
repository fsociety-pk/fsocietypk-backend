import { Router } from 'express';
import * as projectController from '../controllers/project.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = Router();

// Public route to view projects
router.get('/', projectController.getProjects);
router.get('/:id', projectController.getProjectById);

// Protected routes for admins
router.use(protect);
router.use(restrictTo('admin'));

router.post('/', projectController.createProject);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

export default router;
