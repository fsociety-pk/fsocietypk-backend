import { Request, Response } from 'express';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

/** Validate flag format */
const FLAG_REGEX = /^FSOCIETYPK\{.+\}$/i;

/**
 * @desc    Get all approved & active challenges (with isSolved for the user)
 * @route   GET /api/v1/challenges
 * @access  Private
 */
export const getChallenges = asyncHandler(async (req: Request, res: Response) => {
  const challenges = await Challenge.find({ isActive: true, status: 'approved' })
    .select('-flag')
    .populate('createdBy', 'username')
    .sort({ difficulty: 1, points: 1 });

  // Get current user's correct solves
  const userSolves = await Submission.find({
    userId: req.user!._id,
    isCorrect: true,
  }).select('challengeId');

  const solvedIds = userSolves.map((s) => s.challengeId.toString());

  const challengesWithStatus = challenges.map((c: any) => ({
    ...c.toObject(),
    isSolved: solvedIds.includes(c._id.toString()),
  }));

  res.status(200).json(ApiResponse.ok('Challenges retrieved', challengesWithStatus));
});

/**
 * @desc    Get challenge by ID
 * @route   GET /api/v1/challenges/:id
 * @access  Private
 */
export const getChallengeById = asyncHandler(async (req: Request, res: Response) => {
  const challenge = await Challenge.findById(req.params.id)
    .select('-flag')
    .populate('createdBy', 'username');

  if (!challenge || !challenge.isActive || challenge.status !== 'approved') {
    throw ApiError.notFound('Challenge not found');
  }

  const solved = await Submission.findOne({
    userId: req.user!._id,
    challengeId: req.params.id,
    isCorrect: true,
  });

  res.status(200).json(
    ApiResponse.ok('Challenge detail retrieved', {
      ...challenge.toObject(),
      isSolved: !!solved,
    })
  );
});

/**
 * @desc    Submit flag for a challenge (Solver side)
 * @route   POST /api/v1/challenges/submit
 * @access  Private
 */
export const submitFlag = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId, flag } = req.body;

  if (!challengeId || !flag) {
    throw ApiError.badRequest('Challenge ID and flag are required');
  }

  // Fetch challenge with flag selected
  const challenge = await Challenge.findById(challengeId).select('+flag');
  if (!challenge || !challenge.isActive || challenge.status !== 'approved') {
    throw ApiError.notFound('Challenge not found');
  }

  // Prevent duplicate solve
  const existingSolve = await Submission.findOne({
    userId: req.user!._id,
    challengeId,
    isCorrect: true,
  });

  if (existingSolve) {
    return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true }));
  }

  // Compare flag (bcrypt compare — inherently case-insensitive after lowercasing)
  const isCorrect = await challenge.compareFlag(flag);

  // Record submission
  await Submission.create({
    userId: req.user!._id,
    challengeId,
    submittedFlag: flag,
    isCorrect,
    pointsAwarded: isCorrect ? challenge.points : 0,
  });

  if (isCorrect) {
    // Increment solve count
    await Challenge.findByIdAndUpdate(challengeId, { $inc: { solveCount: 1 } });

    // Award points to user
    await User.findByIdAndUpdate(req.user!._id, {
      $inc: { score: challenge.points },
      $addToSet: { solvedChallenges: challengeId },
    });

    // Real-time leaderboard
    const { emitLeaderboardUpdate } = await import('../socket');
    emitLeaderboardUpdate();

    return res.status(200).json(
      ApiResponse.ok('Flag Correct! Points awarded.', {
        correct: true,
        points: challenge.points,
      })
    );
  }

  return res.status(200).json(ApiResponse.ok('Incorrect Flag. Try again.', { correct: false }));
});

/**
 * @desc    Submit a new challenge (from any authenticated user)
 * @route   POST /api/v1/challenges
 * @access  Private
 */
export const createChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, category, difficulty, flag, hints, attachments } = req.body;

  // Validate required fields
  if (!title || !description || !category || !difficulty || !flag) {
    throw ApiError.badRequest('Title, description, category, difficulty, and flag are required');
  }

  // Validate flag format
  if (!FLAG_REGEX.test(flag.trim())) {
    throw ApiError.badRequest('Flag must follow the format: FSOCIETYPK{...}');
  }

  // Build hints array if provided
  const parsedHints = Array.isArray(hints)
    ? hints
        .filter((h: any) => typeof h === 'string' ? h.trim() : h?.content?.trim())
        .map((h: any) =>
          typeof h === 'string'
            ? { content: h.trim(), cost: 0 }
            : { content: h.content?.trim(), cost: h.cost ?? 0 }
        )
    : [];

  // Build attachments array if provided
  const parsedAttachments = Array.isArray(attachments)
    ? attachments.filter((a: string) => typeof a === 'string' && a.trim()).map((a: string) => a.trim())
    : [];

  const challenge = await Challenge.create({
    title: title.trim(),
    description: description.trim(),
    category: category.toLowerCase(),
    difficulty: difficulty.toLowerCase(),
    flag: flag.trim(), // will be hashed by pre-save hook
    hints: parsedHints,
    attachments: parsedAttachments,
    status: 'pending',
    isActive: false,
    createdBy: req.user!._id,
  });

  res.status(201).json(
    ApiResponse.ok('Challenge submitted successfully! Awaiting admin review.', {
      _id: challenge._id,
      title: challenge.title,
      status: challenge.status,
      difficulty: challenge.difficulty,
      points: challenge.points,
    })
  );
});

/**
 * @desc    Get current user's submitted challenges (all statuses)
 * @route   GET /api/v1/challenges/my-submissions
 * @access  Private
 */
export const mySubmissions = asyncHandler(async (req: Request, res: Response) => {
  const challenges = await Challenge.find({ createdBy: req.user!._id })
    .select('-flag')
    .sort({ createdAt: -1 });

  res.status(200).json(ApiResponse.ok('Your submitted challenges', challenges));
});
