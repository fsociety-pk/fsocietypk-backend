import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, signupSchema } from '../schemas/auth.schema';

const router = Router();

// ── Public Routes ────────────────────────────────────────────────
router.post('/register', validate(signupSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);

// ── Private Routes ───────────────────────────────────────────────
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);

export default router;
