import { Request, Response } from 'express';
import { Writeup } from '../models/Writeup';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * @desc    Submit a new writeup for a challenge
 * @route   POST /api/v1/writeups
 * @access  Private
 */
export const submitWriteup = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId, title, content } = req.body;
  const userId = req.user!._id;

  // Validate inputs
  if (!challengeId || !title || !content) {
    throw ApiError.badRequest('Challenge ID, title, and content are required');
  }

  // Check if challenge exists
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) {
    throw ApiError.notFound('Challenge not found');
  }

  // Check if user has solved the challenge
  const userSolve = await Submission.findOne({
    userId,
    challengeId,
    isCorrect: true,
  });

  if (!userSolve) {
    throw ApiError.forbidden('You must solve this challenge first before submitting a writeup');
  }

  // Check if user already has a pending/approved writeup for this challenge
  const existingWriteup = await Writeup.findOne({
    userId,
    challengeId,
    status: { $in: ['pending', 'approved'] },
  });

  if (existingWriteup) {
    throw ApiError.badRequest('You already have a writeup for this challenge pending or approved');
  }

  // Create new writeup
  const writeup = await Writeup.create({
    userId,
    challengeId,
    title,
    content,
    status: 'pending',
  });

  const populatedWriteup = await writeup.populate([
    { path: 'userId', select: 'username avatar' },
    { path: 'challengeId', select: 'title category' },
  ]);

  res.status(201).json(ApiResponse.ok('Writeup submitted successfully', populatedWriteup));
});

/**
 * @desc    Get all approved writeups for a challenge
 * @route   GET /api/v1/writeups/challenge/:challengeId
 * @access  Public
 */
export const getWriteupsForChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Validate challenge exists
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) {
    throw ApiError.notFound('Challenge not found');
  }

  const writeups = await Writeup.find({
    challengeId,
    status: 'approved',
  })
    .populate('userId', 'username avatar')
    .populate('challengeId', 'title category')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Writeup.countDocuments({
    challengeId,
    status: 'approved',
  });

  res.status(200).json(
    ApiResponse.ok('Writeups retrieved successfully', {
      writeups,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * @desc    Get user's writeups
 * @route   GET /api/v1/writeups/user/me
 * @access  Private
 */
export const getUserWriteups = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const writeups = await Writeup.find({ userId })
    .populate('challengeId', 'title category points')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Writeup.countDocuments({ userId });

  res.status(200).json(
    ApiResponse.ok('User writeups retrieved successfully', {
      writeups,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * @desc    Get a specific writeup by ID
 * @route   GET /api/v1/writeups/:id
 * @access  Public
 */
export const getWriteupById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const writeup = await Writeup.findById(id).populate([
    { path: 'userId', select: 'username avatar -_id' },
    { path: 'challengeId', select: 'title category points difficulty -_id' },
  ]);

  if (!writeup) {
    throw ApiError.notFound('Writeup not found');
  }

  // Only show approved writeups or if user is the author
  if (writeup.status !== 'approved' && writeup.userId.toString() !== req.user?._id.toString()) {
    throw ApiError.forbidden('You do not have permission to view this writeup');
  }

  res.status(200).json(ApiResponse.ok('Writeup retrieved successfully', writeup));
});

/**
 * @desc    Update a writeup (only by author before approval)
 * @route   PUT /api/v1/writeups/:id
 * @access  Private
 */
export const updateWriteup = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const userId = req.user!._id;

  const writeup = await Writeup.findById(id);

  if (!writeup) {
    throw ApiError.notFound('Writeup not found');
  }

  // Only author can update their writeup
  if (writeup.userId.toString() !== userId.toString()) {
    throw ApiError.forbidden('You can only update your own writeups');
  }

  // Can only update if status is pending
  if (writeup.status !== 'pending') {
    throw ApiError.badRequest('You can only edit pending writeups');
  }

  // Update fields
  if (title) writeup.title = title;
  if (content) writeup.content = content;

  await writeup.save();

  const updatedWriteup = await writeup.populate([
    { path: 'userId', select: 'username avatar' },
    { path: 'challengeId', select: 'title category' },
  ]);

  res.status(200).json(ApiResponse.ok('Writeup updated successfully', updatedWriteup));
});

/**
 * @desc    Delete a writeup (only by author or admin)
 * @route   DELETE /api/v1/writeups/:id
 * @access  Private
 */
export const deleteWriteup = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!._id;
  const userRole = req.user!.role;

  const writeup = await Writeup.findById(id);

  if (!writeup) {
    throw ApiError.notFound('Writeup not found');
  }

  // Only author or admin can delete
  if (writeup.userId.toString() !== userId.toString() && userRole !== 'admin') {
    throw ApiError.forbidden('You can only delete your own writeups');
  }

  await Writeup.findByIdAndDelete(id);

  res.status(200).json(ApiResponse.ok('Writeup deleted successfully', null));
});

/**
 * @desc    Get pending writeups for admin approval
 * @route   GET /api/v1/admin/writeups/pending
 * @access  Private/Admin
 */
export const getPendingWriteups = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const writeups = await Writeup.find({ status: 'pending' })
    .populate('userId', 'username avatar')
    .populate('challengeId', 'title category')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Writeup.countDocuments({ status: 'pending' });

  res.status(200).json(
    ApiResponse.ok('Pending writeups retrieved successfully', {
      writeups,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * @desc    Approve a writeup
 * @route   PUT /api/v1/admin/writeups/:id/approve
 * @access  Private/Admin
 */
export const approveWriteup = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const writeup = await Writeup.findById(id);

  if (!writeup) {
    throw ApiError.notFound('Writeup not found');
  }

  if (writeup.status !== 'pending') {
    throw ApiError.badRequest('Only pending writeups can be approved');
  }

  writeup.status = 'approved';
  writeup.adminNotes = '';
  await writeup.save();

  const updatedWriteup = await writeup.populate([
    { path: 'userId', select: 'username avatar' },
    { path: 'challengeId', select: 'title category' },
  ]);

  res.status(200).json(ApiResponse.ok('Writeup approved successfully', updatedWriteup));
});

/**
 * @desc    Reject a writeup
 * @route   PUT /api/v1/admin/writeups/:id/reject
 * @access  Private/Admin
 */
export const rejectWriteup = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminNotes } = req.body;

  const writeup = await Writeup.findById(id);

  if (!writeup) {
    throw ApiError.notFound('Writeup not found');
  }

  if (writeup.status !== 'pending') {
    throw ApiError.badRequest('Only pending writeups can be rejected');
  }

  writeup.status = 'rejected';
  writeup.adminNotes = adminNotes || 'Rejected by admin';
  await writeup.save();

  const updatedWriteup = await writeup.populate([
    { path: 'userId', select: 'username avatar' },
    { path: 'challengeId', select: 'title category' },
  ]);

  res.status(200).json(ApiResponse.ok('Writeup rejected successfully', updatedWriteup));
});
