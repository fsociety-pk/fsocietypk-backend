import { Router } from 'express';
import { protect, requirePermission, restrictTo } from '../middleware/auth.middleware';
import * as writeupController from '../controllers/writeup.controller';

const router = Router();

const requireAdmin = requirePermission('reviews');

// ── Public Routes ──────────────────────────────────────────────
/** Get all approved writeups for a challenge */
router.get('/challenge/:challengeId', writeupController.getWriteupsForChallenge);

/** Get a specific writeup by ID */
router.get('/:id', writeupController.getWriteupById);

// ── Private Routes (Authenticated Users) ──────────────────────
/** Submit a new writeup */
router.post('/', protect, restrictTo('user'), writeupController.submitWriteup);

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
