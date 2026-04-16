import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// ── All challenge routes require authentication ───────────────────
router.use(protect);

// ── User routes ───────────────────────────────────────────────────
router.get('/my-submissions', challengeController.mySubmissions);
router.get('/', challengeController.getChallenges);
router.get('/:id', challengeController.getChallengeById);
router.get('/:id/solvers', challengeController.getRecentSolvers);

// Flag submission (solver side)
router.post('/submit', challengeController.submitFlag);

// Challenge creation (any authenticated user)
router.post('/', challengeController.createChallenge);

export default router;
