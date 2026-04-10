import { Request, Response } from 'express';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { createNotification, notificationTemplates } from '../utils/notificationHelper';

/** Validate flag format */
const FLAG_REGEX = /^fsociety\{.+\}$/i;

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
  const { title, description, category, difficulty, flag, flags, hints, attachments } = req.body;

  // Validate required fields
  if (!title || !description || !category || !difficulty) {
    throw ApiError.badRequest('Title, description, category, difficulty, and flag/flags are required');
  }

  // Check if either flag or flags is provided
  if (!flag && (!flags || flags.length === 0)) {
    throw ApiError.badRequest('Either flag or flags array is required');
  }

  // Validate flag format for single flag
  if (flag && !FLAG_REGEX.test(flag.trim())) {
    throw ApiError.badRequest('Flag must follow the format: fsociety{...}');
  }

  // Validate flag format for multiple flags
  if (flags && Array.isArray(flags)) {
    for (const f of flags) {
      if (!f.value || !FLAG_REGEX.test(f.value.trim())) {
        throw ApiError.badRequest(`Each flag must follow the format: fsociety{...}`);
      }
    }
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

  const challengeData: any = {
    title: title.trim(),
    description: description.trim(),
    category: category.toLowerCase(),
    difficulty: difficulty.toLowerCase(),
    hints: parsedHints,
    attachments: parsedAttachments,
    status: 'pending',
    isActive: false,
    createdBy: req.user!._id,
  };

  // Add flag(s)
  if (flag) {
    challengeData.flag = flag.trim();
  }
  if (flags && Array.isArray(flags)) {
    challengeData.flags = flags.map((f: any) => ({
      sequence: f.sequence || 1,
      value: f.value.trim(),
    }));
  }

  const challenge = await Challenge.create(challengeData);

  // Create notification for user about submission
  await createNotification({
    userId: req.user!._id,
    title: 'Challenge Submitted',
    message: `Your challenge "${challenge.title}" has been submitted for review. Admins will review it shortly.`,
    type: 'challenge_submitted',
    challengeId: challenge._id,
    data: { challengeId: challenge._id, status: 'pending' },
  });

  // Notify all active admins so submissions are visible in the admin panel notification center.
  const admins = await User.find({ role: 'admin', isBanned: false }).select('_id');
  const submitter = await User.findById(req.user!._id).select('username');
  const submitterUsername = submitter?.username || 'A user';
  const adminTemplate = notificationTemplates.challengeSubmissionNotification(submitterUsername, challenge.title);

  await Promise.all(
    admins
      .filter((admin) => admin._id.toString() !== req.user!._id.toString())
      .map((admin) =>
        createNotification({
          userId: admin._id,
          title: adminTemplate.title,
          message: adminTemplate.message,
          type: adminTemplate.type as any,
          challengeId: challenge._id,
          data: {
            challengeId: challenge._id,
            status: 'pending',
            submittedBy: req.user!._id,
            submittedByUsername: submitterUsername,
          },
        })
      )
  );

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
