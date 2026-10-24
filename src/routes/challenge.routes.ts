import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller';
import { protect } from '../middleware/auth.middleware';
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

router.post('/submit', flagSubmissionLimiter, protect, challengeController.submitFlag);

// ── All remaining challenge routes require authentication ─────────
router.use(protect);

// ── User routes ───────────────────────────────────────────────────
router.get('/my-submissions', challengeController.mySubmissions);
router.get('/', challengeController.getChallenges);
router.get('/:id', challengeController.getChallengeById);
router.get('/:id/solvers', challengeController.getRecentSolvers);

// Challenge creation (any authenticated user)
router.post('/', challengeController.createChallenge);

export default router;
