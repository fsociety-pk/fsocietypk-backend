import { Router } from 'express';
import * as leaderboardController from '../controllers/leaderboard.controller';

const router = Router();

router.get('/', leaderboardController.getLeaderboard);

export default router;
