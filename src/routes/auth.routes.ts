import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { detectAuthPayload, authPayloadMessage } from '../utils/authInputFeedback';

const router = Router();
// Before schema validation, so obvious payloads receive the friendly response.
// Passwords are opaque secrets: punctuation and SQL-like words remain valid.
router.use(['/register', '/login'], (req, res, next) => {
  for (const field of ['username', 'email'] as const) {
    const kind = detectAuthPayload(req.body?.[field]);
    if (kind) {
      res.status(400).json({ success: false, message: authPayloadMessage(kind), data: { isSQLInjection: kind === 'sql', isXSS: kind === 'xss', payloadType: kind } });
      return;
    }
  }
  next();
});
router.post('/register', authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-otp', authController.resendOtp);
router.post('/login', authController.login);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);
export default router;
