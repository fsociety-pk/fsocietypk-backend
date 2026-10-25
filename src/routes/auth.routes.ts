import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { checkForSQLInjection, getSQLInjectionResponse } from '../utils/sqlInjectionDetector';

const router = Router();
// Before schema validation, so obvious payloads receive the friendly response.
// Passwords are opaque secrets: punctuation and SQL-like words remain valid.
router.use(['/register', '/login'], (req, res, next) => {
  if (checkForSQLInjection(req.body).detected) {
    const result = getSQLInjectionResponse();
    res.status(result.statusCode).json({ success: false, message: result.message, data: { isSQLInjection: true } });
    return;
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
