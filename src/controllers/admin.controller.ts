import { Request, Response } from 'express';
import { User } from '../models/User';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

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
    totalPointsGiven
  ] = await Promise.all([
    User.countDocuments(),
    Challenge.countDocuments({ status: 'approved' }),
    Challenge.countDocuments({ status: 'pending' }),
    Submission.countDocuments(),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$score' } } }])
  ]);

  res.status(200).json(ApiResponse.ok('System statistics retrieved', {
    totalUsers,
    totalChallenges,
    pendingChallenges,
    totalSubmissions,
    totalPointsPlatform: totalPointsGiven[0]?.total || 0
  }));
});

/**
 * @desc    Get all users with basic info
 * @route   GET /api/v1/admin/users
 * @access  Private/Admin
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const users = await User.find()
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments();

  res.status(200).json(ApiResponse.ok('Users retrieved successfully', {
    users,
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

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role === 'admin') {
    throw ApiError.badRequest('Cannot ban an administrative account');
  }

  user.isBanned = !user.isBanned;
  await user.save();

  res.status(200).json(ApiResponse.ok(`User ${user.isBanned ? 'banned' : 'unbanned'} successfully`, user));
});

/**
 * @desc    Get all challenges (any status), with optional filter
 * @route   GET /api/v1/admin/challenges
 * @access  Private/Admin
 */
export const getChallenges = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  const filter: any = {};
  if (status) filter.status = status;

  const challenges = await Challenge.find(filter)
    .populate('createdBy', 'username email')
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
  const { status, rejectionReason, isActive } = req.body;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw ApiError.badRequest('Invalid status. Must be: pending, approved, or rejected');
  }

  const challenge = await Challenge.findById(id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

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

  res.status(200).json(ApiResponse.ok(`Challenge ${status}`, challenge));
});

/**
 * @desc    Delete a challenge (and its submissions)
 * @route   DELETE /api/v1/admin/challenges/:id
 * @access  Private/Admin
 */
export const deleteChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const challenge = await Challenge.findByIdAndDelete(id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

  // Cleanup submissions
  await Submission.deleteMany({ challengeId: id });

  res.status(200).json(ApiResponse.ok('Challenge and related data purged', null));
});
