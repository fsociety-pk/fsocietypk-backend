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

  const normalizedFlag = String(flag).trim();
  if (!normalizedFlag) {
    throw ApiError.badRequest('Flag cannot be empty');
  }

  if (normalizedFlag.length > 500) {
    throw ApiError.badRequest('Flag is too long');
  }

  // Fetch challenge with flag selected
  const challenge = await Challenge.findById(challengeId).select('+flag');
  if (!challenge || !challenge.isActive || challenge.status !== 'approved') {
    throw ApiError.notFound('Challenge not found');
  }

  const orderedFlags = Array.isArray(challenge.flags)
    ? [...challenge.flags].sort((a: any, b: any) => a.sequence - b.sequence)
    : [];

  // Multi-flag challenge: enforce strict sequence progression.
  if (orderedFlags.length > 0) {
    const solvedSteps = await Submission.find({
      userId: req.user!._id,
      challengeId,
      isCorrect: true,
      sequenceNumber: { $exists: true, $ne: null },
    }).select('sequenceNumber');

    const solvedSet = new Set(
      solvedSteps
        .map((s: any) => s.sequenceNumber)
        .filter((n: unknown): n is number => typeof n === 'number')
    );

    const nextFlag = orderedFlags.find((f: any) => !solvedSet.has(f.sequence));

    if (!nextFlag) {
      return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true }));
    }

    const isCorrect = await challenge.compareFlag(normalizedFlag, nextFlag.sequence);

    await Submission.create({
      userId: req.user!._id,
      challengeId,
      submittedFlag: normalizedFlag,
      isCorrect,
      pointsAwarded: 0,
      sequenceNumber: nextFlag.sequence,
    });

    if (!isCorrect) {
      return res.status(200).json(
        ApiResponse.ok(`Incorrect flag. Submit flag #${nextFlag.sequence}.`, {
          correct: false,
          nextSequence: nextFlag.sequence,
        })
      );
    }

    const solvedCountAfterCurrent = solvedSet.size + 1;
    const isFinalFlag = solvedCountAfterCurrent >= orderedFlags.length;

    if (!isFinalFlag) {
      const upcoming = orderedFlags.find((f: any) => !solvedSet.has(f.sequence) && f.sequence !== nextFlag.sequence);

      return res.status(200).json(
        ApiResponse.ok(`Flag #${nextFlag.sequence} correct. Continue to the next flag.`, {
          correct: true,
          partial: true,
          solvedSequence: nextFlag.sequence,
          nextSequence: upcoming?.sequence,
        })
      );
    }

    await Submission.findOneAndUpdate(
      {
        userId: req.user!._id,
        challengeId,
        isCorrect: true,
        sequenceNumber: nextFlag.sequence,
      },
      { $set: { pointsAwarded: challenge.points } }
    );

    await Challenge.findByIdAndUpdate(challengeId, { $inc: { solveCount: 1 } });

    await User.findByIdAndUpdate(req.user!._id, {
      $inc: { score: challenge.points },
      $addToSet: { solvedChallenges: challengeId },
    });

    const { emitLeaderboardUpdate } = await import('../socket');
    emitLeaderboardUpdate();

    return res.status(200).json(
      ApiResponse.ok('All flags correct! Challenge completed.', {
        correct: true,
        points: challenge.points,
        completed: true,
      })
    );
  }

  // Single-flag challenge: prevent duplicate solve.
  const existingSolve = await Submission.findOne({
    userId: req.user!._id,
    challengeId,
    isCorrect: true,
  });

  if (existingSolve) {
    return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true }));
  }

  const isCorrect = await challenge.compareFlag(normalizedFlag);

  await Submission.create({
    userId: req.user!._id,
    challengeId,
    submittedFlag: normalizedFlag,
    isCorrect,
    pointsAwarded: isCorrect ? challenge.points : 0,
  });

  if (isCorrect) {
    await Challenge.findByIdAndUpdate(challengeId, { $inc: { solveCount: 1 } });

    await User.findByIdAndUpdate(req.user!._id, {
      $inc: { score: challenge.points },
      $addToSet: { solvedChallenges: challengeId },
    });

    const { emitLeaderboardUpdate } = await import('../socket');
    emitLeaderboardUpdate();

    return res.status(200).json(
      ApiResponse.ok('Flag correct! Challenge completed.', {
        correct: true,
        points: challenge.points,
      })
    );
  }

  return res.status(200).json(ApiResponse.ok('Incorrect Flag. Try again.', { correct: false }));
});

/**
 * @desc    Get recent solvers for a challenge
 * @route   GET /api/v1/challenges/:id/solvers
 * @access  Private
 */
export const getRecentSolvers = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const submissions = await Submission.find({
    challengeId: id,
    isCorrect: true,
  })
    .sort({ timestamp: -1 })
    .limit(5)
    .populate('userId', 'username avatar score');

  const solvers = submissions.map((s: any) => ({
    username: s.userId.username,
    avatar: s.userId.avatar,
    score: s.userId.score,
    timestamp: s.timestamp || s.createdAt,
  }));

  res.status(200).json(ApiResponse.ok('Recent solvers retrieved', solvers));
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

  const hasSingleFlag = typeof flag === 'string' && flag.trim().length > 0;
  const hasMultiFlags = Array.isArray(flags) && flags.length > 0;

  if (!hasSingleFlag && !hasMultiFlags) {
    throw ApiError.badRequest('Either one flag or a non-empty flags array is required');
  }

  if (hasSingleFlag && hasMultiFlags) {
    throw ApiError.badRequest('Provide either single flag or flags array, not both');
  }

  // Validate flag format for single flag
  if (hasSingleFlag && !FLAG_REGEX.test(flag.trim())) {
    throw ApiError.badRequest('Flag must follow the format: fsociety{...}');
  }

  // Validate flag format for multiple flags
  if (hasMultiFlags) {
    const sequenceSet = new Set<number>();

    for (const f of flags) {
      if (!Number.isInteger(f.sequence) || f.sequence < 1) {
        throw ApiError.badRequest('Each multi-flag entry must have a sequence number starting from 1');
      }

      if (sequenceSet.has(f.sequence)) {
        throw ApiError.badRequest('Duplicate sequence found in flags array');
      }
      sequenceSet.add(f.sequence);

      if (!f.value || !FLAG_REGEX.test(f.value.trim())) {
        throw ApiError.badRequest(`Each flag must follow the format: fsociety{...}`);
      }
    }

    for (let i = 1; i <= flags.length; i++) {
      if (!sequenceSet.has(i)) {
        throw ApiError.badRequest('Flag sequences must be continuous in order: 1, 2, 3, ...');
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

  const isAdminSubmission = req.user?.role === 'admin';

  const challengeData: any = {
    title: title.trim(),
    description: description.trim(),
    category: category.toLowerCase(),
    difficulty: difficulty.toLowerCase(),
    hints: parsedHints,
    attachments: parsedAttachments,
    status: isAdminSubmission ? 'approved' : 'pending',
    isActive: isAdminSubmission,
    createdBy: req.user!._id,
  };

  // Add flag(s)
  if (hasSingleFlag) {
    challengeData.flag = flag.trim();
  }
  if (hasMultiFlags) {
    challengeData.flags = [...flags]
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map((f: any) => ({
      sequence: f.sequence,
      value: f.value.trim(),
    }));
  }

  const challenge = await Challenge.create(challengeData);

  if (!isAdminSubmission) {
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
  }

  res.status(201).json(
    ApiResponse.ok(
      isAdminSubmission
        ? 'Challenge created and published successfully.'
        : 'Challenge submitted successfully! Awaiting admin review.',
      {
      _id: challenge._id,
      title: challenge.title,
      status: challenge.status,
      isActive: challenge.isActive,
      difficulty: challenge.difficulty,
      points: challenge.points,
      }
    )
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
