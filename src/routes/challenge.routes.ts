import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { uploadChallengeAttachments } from '../middleware/challengeUpload.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Limit flag guesses before authentication/database lookup to discourage brute force.
const flagSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many flag attempts. Please try again later.' },
});

router.post('/submit', flagSubmissionLimiter, protect, restrictTo('user'), challengeController.submitFlag);

// ── All remaining challenge routes require authentication ─────────
router.use(protect);

// ── User routes ───────────────────────────────────────────────────
router.get('/my-submissions', challengeController.mySubmissions);
router.get('/', challengeController.getChallenges);
router.get('/:id', challengeController.getChallengeById);
router.get('/:id/solvers', challengeController.getRecentSolvers);
router.get('/:id/attachments/:attachmentId/download', challengeController.downloadAttachment);

// Challenge creation (any authenticated user)
router.post('/', uploadChallengeAttachments, challengeController.createChallenge);

export default router;
