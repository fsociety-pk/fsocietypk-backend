import { Router, Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/auth.middleware';
import * as writeupController from '../controllers/writeup.controller';

const router = Router();

// Middleware to check if user is admin
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
    return;
  }
  next();
};

// ── Public Routes ──────────────────────────────────────────────
/** Get all approved writeups for a challenge */
router.get('/challenge/:challengeId', writeupController.getWriteupsForChallenge);

/** Get a specific writeup by ID */
router.get('/:id', writeupController.getWriteupById);

// ── Private Routes (Authenticated Users) ──────────────────────
/** Submit a new writeup */
router.post('/', protect, writeupController.submitWriteup);

/** Get user's writeups */
router.get('/user/me', protect, writeupController.getUserWriteups);

/** Update a writeup */
router.put('/:id', protect, writeupController.updateWriteup);

/** Delete a writeup */
router.delete('/:id', protect, writeupController.deleteWriteup);

// ── Admin Routes ──────────────────────────────────────────────
/** Get pending writeups for approval */
router.get('/admin/pending', protect, requireAdmin, writeupController.getPendingWriteups);

/** Approve a writeup */
router.put('/:id/approve', protect, requireAdmin, writeupController.approveWriteup);

/** Reject a writeup */
router.put('/:id/reject', protect, requireAdmin, writeupController.rejectWriteup);

export default router;
