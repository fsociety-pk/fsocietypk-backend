import { Request, Response } from 'express';
import { User } from '../models/User';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { createNotification, notificationTemplates } from '../utils/notificationHelper';
import { deleteFromR2 } from '../lib/r2';
import { Writeup } from '../models/Writeup';
import { Resource } from '../models/Resource';
import { Project } from '../models/Project';
import { adminChallengeUpdateSchema, adminIdSchema, adminStatusSchema, adminUsersQuerySchema, adminRoleUpdateSchema } from '../schemas/admin.schema';
import { hasPermission } from '../utils/roles';
import { enqueueChallengeEmail } from '../utils/platformEmail';
import logger from '../utils/logger';

/**
 * @desc    Get system overview stats
 * @route   GET /api/v1/admin/stats
 * @access  Private/Admin
 */
export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalUsers,
    totalChallenges,
    pendingChallenges,
    totalSubmissions,
    totalPointsGiven,
    pendingWriteups,
    pendingResources,
    totalProjects,
    bannedUsers
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Challenge.countDocuments({ status: 'approved' }),
    Challenge.countDocuments({ status: 'pending' }),
    Submission.countDocuments(),
    User.aggregate([{ $match: { role: 'user' } }, { $group: { _id: null, total: { $sum: '$score' } } }]),
    Writeup.countDocuments({ status: 'pending' }),
    Resource.countDocuments({ isApproved: false }),
    Project.countDocuments(),
    User.countDocuments({ role: 'user', isBanned: true })
  ]);

  res.status(200).json(ApiResponse.ok('System statistics retrieved', {
    totalUsers,
    totalChallenges,
    pendingChallenges,
    totalSubmissions,
    pendingWriteups,
    pendingResources,
    totalProjects,
    bannedUsers,
    totalPointsPlatform: totalPointsGiven[0]?.total || 0
  }));
});

/**
 * @desc    Get all users with basic info
 * @route   GET /api/v1/admin/users
 * @access  Private/Admin
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const parsed = adminUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest('Invalid member filters', parsed.error.issues);
  const { page, limit, search, status, role } = parsed.data;
  if (!hasPermission(req.user?.role, 'members') && !hasPermission(req.user?.role, 'roles')) throw ApiError.forbidden('Member management permission required');
  if (role !== 'user' && !hasPermission(req.user?.role, 'roles')) throw ApiError.forbidden('Staff role management permission required');
  const filter: any = role === 'all' ? {} : { role: role === 'staff' ? { $ne: 'user' } : 'user' };
  if (status !== 'all') filter.isBanned = status === 'banned';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ username: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }];
  }
  const skip = (page - 1) * limit;

  const users = await User.find(filter)
    .select('username email role avatar score isBanned createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(filter);
  const primary = role !== 'user' ? await User.findOne({ role: 'admin', isBanned: false }).sort({ createdAt: 1, _id: 1 }).select('_id') : null;

  res.status(200).json(ApiResponse.ok('Users retrieved successfully', {
    users,
    protectedAdminId: primary?._id.toString(),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  }));
});

/**
 * @desc    Toggle user ban status
 * @route   PATCH /api/v1/admin/users/:id/ban
 * @access  Private/Admin
 */
export const toggleBan = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!adminIdSchema.safeParse(id).success) throw ApiError.badRequest('Invalid member ID');

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role !== 'user') {
    throw ApiError.badRequest('Remove staff access before suspending an account');
  }

  const updated = await User.findOneAndUpdate(
    { _id: id, role: 'user', isBanned: user.isBanned },
    { $set: { isBanned: !user.isBanned }, $inc: { sessionVersion: 1 } },
    { new: true, runValidators: true },
  ).select('username role isBanned avatar score createdAt');
  if (!updated) throw ApiError.conflict('Account access changed. Refresh and try again.');
  res.status(200).json(ApiResponse.ok(`User ${updated.isBanned ? 'banned' : 'unbanned'} successfully`, updated));
});

/**
 * @desc    Get all challenges (any status), with optional filter
 * @route   GET /api/v1/admin/challenges
 * @access  Private/Admin
 */
export const getChallenges = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  if (status && !['pending', 'approved', 'rejected'].includes(String(status))) throw ApiError.badRequest('Invalid challenge filter');
  const filter: any = {};
  if (status) filter.status = status;

  const challenges = await Challenge.find(filter)
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 });

  // Expose createdBy also as "author" on each doc for legacy front-end code
  const result = challenges.map((c: any) => {
    const obj = c.toObject({ virtuals: false });
    obj.author = obj.createdBy;
    return obj;
  });

  res.status(200).json(ApiResponse.ok('Admin challenge list retrieved', result));
});

/**
 * @desc    Update challenge status (Approve/Reject with optional reason)
 * @route   PATCH /api/v1/admin/challenges/:id/status
 * @access  Private/Admin
 */
export const updateChallengeStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!adminIdSchema.safeParse(id).success) throw ApiError.badRequest('Invalid challenge ID');
  const parsed = adminStatusSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid challenge status', parsed.error.issues);
  const { status, rejectionReason, isActive } = parsed.data;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw ApiError.badRequest('Invalid status. Must be: pending, approved, or rejected');
  }

  const challenge = await Challenge.findById(id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

  const previousStatus = challenge.status;
  challenge.status = status;

  // Auto-activate when approved, deactivate otherwise
  challenge.isActive = isActive !== undefined ? isActive : (status === 'approved');

  // Store rejection reason when rejecting
  if (status === 'rejected' && rejectionReason) {
    challenge.rejectionReason = rejectionReason.trim();
  } else if (status === 'approved') {
    challenge.rejectionReason = null as any;
  }

  await challenge.save();

  let emailQueued = false;
  if (status === 'approved') {
    try { await enqueueChallengeEmail(challenge._id.toString(), challenge.title, challenge.description); emailQueued = true; }
    catch { logger.error('Challenge published, but email queueing failed. Publishing again will safely retry queueing.'); }
  }

  // Create notification for the challenge creator
  if (previousStatus !== status) {
    if (status === 'approved') {
      const template = notificationTemplates.challengeApproved(challenge.title);
      await createNotification({
        userId: challenge.createdBy,
        title: template.title,
        message: template.message,
        type: template.type as any,
        challengeId: challenge._id,
        data: { challengeId: challenge._id, status: 'approved' },
      });
    } else if (status === 'rejected') {
      const template = notificationTemplates.challengeRejected(challenge.title, rejectionReason);
      await createNotification({
        userId: challenge.createdBy,
        title: template.title,
        message: template.message,
        type: template.type as any,
        challengeId: challenge._id,
        data: { challengeId: challenge._id, status: 'rejected', reason: rejectionReason },
      });
    }
  }

  const { flag: _flag, flags: _flags, ...data } = challenge.toObject();
  res.status(200).json(ApiResponse.ok(`Challenge ${status}${emailQueued ? '; member emails queued' : ''}`, { ...data, ...(status === 'approved' ? { emailsQueued: emailQueued } : {}) }));
});

/**
 * @desc    Delete a challenge (and its submissions)
 * @route   DELETE /api/v1/admin/challenges/:id
 * @access  Private/Admin
 */
export const deleteChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const challenge = await Challenge.findById(id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

  const fileKeys = challenge.attachments
    .filter((attachment) => typeof attachment !== 'string' && !!attachment.fileKey)
    .map((attachment) => typeof attachment === 'string' ? '' : attachment.fileKey);
  await Promise.all(fileKeys.map((fileKey) => deleteFromR2(fileKey)));
  await challenge.deleteOne();

  // Cleanup submissions
  await Submission.deleteMany({ challengeId: id });

  res.status(200).json(ApiResponse.ok('Challenge and related data purged', null));
});

/**
 * @desc    Update challenge live status (LIVE/ENDED)
 * @route   PATCH /api/v1/admin/challenges/:id/live-status
 * @access  Private/Admin
 */
export const updateChallengeLiveStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { liveStatus } = req.body;

  if (!['live', 'ended'].includes(liveStatus)) {
    throw ApiError.badRequest('Invalid live status. Must be: live or ended');
  }

  const challenge = await Challenge.findById(id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

  if (challenge.status !== 'approved') {
    throw ApiError.badRequest('Can only set live status for approved challenges');
  }

  challenge.liveStatus = liveStatus;
  await challenge.save();

  res.status(200).json(ApiResponse.ok(`Challenge live status updated to ${liveStatus}`, challenge));
});

/** Metadata-only admin preview; hashes never leave the server. */
export const getChallenge = asyncHandler(async (req: Request, res: Response) => {
  if (!adminIdSchema.safeParse(req.params.id).success) throw ApiError.badRequest('Invalid challenge ID');
  const challenge = await Challenge.findById(req.params.id).select('+flags').populate('createdBy', 'username');
  if (!challenge) throw ApiError.notFound('Challenge not found');
  const { flags, flag: _flag, ...data } = challenge.toObject();
  res.json(ApiResponse.ok('Challenge retrieved', { ...data, totalFlags: flags?.length || 1 }));
});

export const updateChallenge = asyncHandler(async (req: Request, res: Response) => {
  if (!adminIdSchema.safeParse(req.params.id).success) throw ApiError.badRequest('Invalid challenge ID');
  const parsed = adminChallengeUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid challenge changes', parsed.error.issues);
  const challenge = await Challenge.findById(req.params.id);
  if (!challenge) throw ApiError.notFound('Challenge not found');
  if ((parsed.data.flags || (parsed.data.difficulty && parsed.data.difficulty !== challenge.difficulty)) &&
      await Submission.exists({ challengeId: req.params.id, isCorrect: true })) {
    throw ApiError.conflict('Flags and difficulty cannot change after correct submissions. Create a new challenge to preserve member progress.');
  }
  Object.assign(challenge, parsed.data);
  if (parsed.data.flags) challenge.flag = undefined;
  await challenge.save();
  const { flags: _flags, flag: _flag, ...data } = challenge.toObject();
  res.json(ApiResponse.ok('Challenge updated', data));
});

/** The oldest active administrator is protected; promotion can only move this anchor earlier. */
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  if (!adminIdSchema.safeParse(req.params.id).success) throw ApiError.badRequest('Invalid account ID');
  const parsed = adminRoleUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Choose a valid role', parsed.error.issues);
  if (req.params.id === req.user!._id) throw ApiError.badRequest('You cannot change your own staff role');
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('Account not found');
  if (target.isBanned && parsed.data.role !== 'user') throw ApiError.badRequest('Restore member access before assigning a staff role');
  if (target.role === 'admin' && parsed.data.role !== 'admin') {
    const primary = await User.findOne({ role: 'admin', isBanned: false }).sort({ createdAt: 1, _id: 1 }).select('_id');
    if (primary?._id.toString() === target._id.toString()) throw ApiError.forbidden('The primary administrator is protected from demotion');
  }
  const updated = await User.findOneAndUpdate({ _id: target._id, role: target.role, isBanned: target.isBanned }, { $set: { role: parsed.data.role }, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true }).select('username role avatar isBanned createdAt');
  if (!updated) throw ApiError.conflict('The account changed. Refresh and try again.');
  res.json(ApiResponse.ok('Role updated. Existing sessions for this account have been revoked.', updated));
});
