import { hasPermission, isStaff, ROLES } from '../utils/roles';
import { enqueueChallengeEmail } from '../utils/platformEmail';
import { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { basename, extname } from 'path';
import { Challenge, IChallengeDocument } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { User } from '../models/User';
import type { IChallengeAttachment } from '../types';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { createNotification, notificationTemplates } from '../utils/notificationHelper';
import { sendChallengeSubmissionEmail } from '../utils/emailHelper';
import { deleteFromR2, getSignedDownloadUrl, uploadToR2 } from '../lib/r2';
import { MAX_CHALLENGE_FILES } from '../middleware/challengeUpload.middleware';
import logger from '../utils/logger';
import { challengeProgressPipeline, getUserChallengeProgress } from '../utils/challengeProgress';
import mongoose from 'mongoose';
import { challengeUrlSchema } from '../schemas/challenge.schema';

/** Validate flag format */
const FLAG_REGEX = /^fsociety\{.+\}$/i;
const CHALLENGE_FILE_CONTENT_TYPES: Record<string, string> = {
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
};

const parseArrayField = (value: unknown, name: string): unknown[] | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      throw ApiError.badRequest(`${name} must be a valid array`);
    }
  }
  throw ApiError.badRequest(`${name} must be an array`);
};

const getFileSha256 = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const cleanOriginalFileName = (fileName: string): string => {
  const cleaned = basename(fileName.replace(/\\/g, '/'))
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const extension = extname(cleaned);
  if (cleaned.length <= 180) return cleaned;
  return extension
    ? `${cleaned.slice(0, 180 - extension.length)}${extension}`
    : cleaned.slice(0, 180);
};

const cleanupR2Uploads = async (fileKeys: string[]): Promise<void> => {
  const results = await Promise.allSettled(fileKeys.map((fileKey) => deleteFromR2(fileKey)));
  if (results.some((result) => result.status === 'rejected')) {
    logger.error('Failed to clean up some R2 objects after challenge submission failed.');
  }
};

/**
 * @desc    Get all approved & active challenges (with isSolved for the user)
 * @route   GET /api/v1/challenges
 * @access  Private
 */
export const getChallenges = asyncHandler(async (req: Request, res: Response) => {
  const challenges = await Challenge.find({ isActive: true, status: 'approved' })
    .select('+flags')
    .populate('createdBy', 'username')
    .sort({ difficulty: 1, points: 1 });

  const progress = await getUserChallengeProgress(req.user!._id);
  const progressById = new Map(progress.map(p => [p.challenge._id.toString(), p]));
  const challengesWithStatus = challenges.map(c => {
    const { flags, flag: _flag, ...publicChallenge } = c.toObject();
    const current = progressById.get(c._id.toString());
    return {
      ...publicChallenge,
      totalFlags: flags?.length || 1,
      completedFlags: current?.completedFlags ?? 0,
      completedSequences: current?.completedSequences.filter(n => n > 0) ?? [],
      isSolved: current?.isSolved ?? false,
      completedAt: current?.completedAt ?? null,
    };
  });

  res.status(200).json(ApiResponse.ok('Challenges retrieved', challengesWithStatus));
});

/**
 * @desc    Get challenge by ID
 * @route   GET /api/v1/challenges/:id
 * @access  Private
 */
export const getChallengeById = asyncHandler(async (req: Request, res: Response) => {
  const challenge = await Challenge.findById(req.params.id)
    .select('+flags')
    .populate('createdBy', 'username');

  if (!challenge || !challenge.isActive || challenge.status !== 'approved') {
    throw ApiError.notFound('Challenge not found');
  }

  const [progress] = await getUserChallengeProgress(req.user!._id, req.params.id);
  const { flags, flag: _flag, ...publicChallenge } = challenge.toObject();

  res.status(200).json(
    ApiResponse.ok('Challenge detail retrieved', {
      ...publicChallenge,
      totalFlags: flags?.length || 1,
      completedFlags: progress?.completedFlags ?? 0,
      completedSequences: progress?.completedSequences.filter(n => n > 0) ?? [],
      isSolved: progress?.isSolved ?? false,
      completedAt: progress?.completedAt ?? null,
    })
  );
});

/**
 * @desc    Redirect to a short-lived private challenge attachment URL
 * @route   GET /api/v1/challenges/:id/attachments/:attachmentId/download
 * @access  Private
 */
export const downloadAttachment = asyncHandler(async (req: Request, res: Response) => {
  const challenge = await Challenge.findById(req.params.id);
  if (!challenge) throw ApiError.notFound('Challenge not found');

  const isOwner = challenge.createdBy.toString() === req.user!._id;
  if (challenge.status !== 'approved' && !isOwner && !hasPermission(req.user!.role, 'challenges.read')) {
    throw ApiError.forbidden('Only the challenge owner or an admin can download these files');
  }

  const attachment = challenge.attachments.find((entry) =>
    typeof entry !== 'string' && entry._id?.toString() === req.params.attachmentId && !!entry.fileKey,
  );
  if (!attachment || typeof attachment === 'string') {
    throw ApiError.notFound('Challenge attachment not found');
  }

  const signedUrl = await getSignedDownloadUrl(
    attachment.fileKey,
    attachment.originalName,
    attachment.contentType,
  );
  res.redirect(302, signedUrl);
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
  const challenge = await Challenge.findById(challengeId).select('+flag +flags');
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
        .filter((n: unknown): n is number => typeof n === 'number' && orderedFlags.some(f => f.sequence === n))
    );

    const nextFlag = orderedFlags.find((f: any) => !solvedSet.has(f.sequence));

    if (!nextFlag) {
      const [progress] = await getUserChallengeProgress(req.user!._id, challengeId);
      return res.status(200).json(ApiResponse.ok('Challenge already solved!', {
        correct: true, completed: true, points: 0, completedAt: progress?.completedAt,
      }));
    }

    const isCorrect = await challenge.compareFlag(normalizedFlag, nextFlag.sequence);

    const submission = await Submission.create({
      userId: req.user!._id,
      challengeId,
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

    const scoreAward = await User.findOneAndUpdate(
      { _id: req.user!._id, solvedChallenges: { $ne: challengeId } },
      {
        $inc: { score: challenge.points },
        $addToSet: { solvedChallenges: challengeId },
      },
      { new: true }
    );

    if (!scoreAward) {
      return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true, completed: true }));
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

    const { emitLeaderboardUpdate } = await import('../socket');
    emitLeaderboardUpdate();

    return res.status(200).json(
      ApiResponse.ok('All flags correct! Challenge completed.', {
        correct: true,
        points: challenge.points,
        completed: true,
        completedAt: submission.timestamp,
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
    return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true, completed: true, completedAt: existingSolve.timestamp }));
  }

  const isCorrect = await challenge.compareFlag(normalizedFlag);

  const submission = await Submission.create({
    userId: req.user!._id,
    challengeId,
    isCorrect,
    pointsAwarded: isCorrect ? challenge.points : 0,
  });

  if (isCorrect) {
    const scoreAward = await User.findOneAndUpdate(
      { _id: req.user!._id, solvedChallenges: { $ne: challengeId } },
      {
        $inc: { score: challenge.points },
        $addToSet: { solvedChallenges: challengeId },
      },
      { new: true }
    );

    if (!scoreAward) {
      await Submission.findByIdAndUpdate(submission._id, { $set: { isCorrect: false, pointsAwarded: 0 } });
      return res.status(200).json(ApiResponse.ok('Challenge already solved!', { correct: true, points: 0 }));
    }

    await Challenge.findByIdAndUpdate(challengeId, { $inc: { solveCount: 1 } });

    const { emitLeaderboardUpdate } = await import('../socket');
    emitLeaderboardUpdate();

    return res.status(200).json(
      ApiResponse.ok('Flag correct! Challenge completed.', {
        correct: true,
        points: challenge.points,
        completedAt: submission.timestamp,
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

  const solvers = await Submission.aggregate([
    ...challengeProgressPipeline({ challengeId: new mongoose.Types.ObjectId(id) }),
    { $match: { isSolved: true } },
    { $sort: { completedAt: -1 } },
    { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $limit: 5 },
    { $project: { _id: 0, username: '$user.username', avatar: '$user.avatar', score: '$pointsAwarded', timestamp: '$completedAt' } },
  ]);

  res.status(200).json(ApiResponse.ok('Recent solvers retrieved', solvers));
});

/**
 * @desc    Submit a new challenge (from any authenticated user)
 * @route   POST /api/v1/challenges
 * @access  Private
 */
export const createChallenge = asyncHandler(async (req: Request, res: Response) => {
  if (isStaff(req.user?.role) && !hasPermission(req.user?.role, 'challenges.write')) throw ApiError.forbidden('Challenge publishing permission required');
  const { title, description, category, difficulty, flag } = req.body;
  const challengeUrl = challengeUrlSchema.safeParse(req.body.challengeUrl);
  if (!challengeUrl.success) {
    throw ApiError.badRequest('Invalid challenge URL', challengeUrl.error.issues);
  }
  const hints = parseArrayField(req.body.hints, 'Hints');
  const flags = parseArrayField(req.body.flags, 'Flags') as Array<{ sequence: number; value: string }> | undefined;
  const attachments = parseArrayField(req.body.attachments, 'Attachments');
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  // Validate required fields
  if (
    typeof title !== 'string' || !title.trim() || title.length > 120 ||
    typeof description !== 'string' || !description.trim() || description.length > 12000 ||
    typeof category !== 'string' ||
    typeof difficulty !== 'string'
  ) {
    throw ApiError.badRequest('Title, description, category, difficulty, and flag/flags are required');
  }

  const allowedCategories = ['web', 'pwn', 'rev', 'crypto', 'forensics', 'osint', 'misc', 'stego', 'network', 'mobile'];
  const allowedDifficulties = ['easy', 'medium', 'hard', 'insane'];
  if (!allowedCategories.includes(category.toLowerCase()) || !allowedDifficulties.includes(difficulty.toLowerCase())) {
    throw ApiError.badRequest('Invalid challenge category or difficulty');
  }

  if ((hints !== undefined && hints.length > 20) ||
      (attachments !== undefined && attachments.length > 10)) {
    throw ApiError.badRequest('A challenge can have at most 20 hints and 10 attachments');
  }
  if (uploadedFiles.length > MAX_CHALLENGE_FILES) {
    throw ApiError.badRequest(`A challenge can have at most ${MAX_CHALLENGE_FILES} uploaded files`);
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
  if (hasSingleFlag && flag.trim().length > 500) {
    throw ApiError.badRequest('Flag is too long');
  }

  // Validate flag format for multiple flags
  if (hasMultiFlags) {
    if (flags.length > 20) {
      throw ApiError.badRequest('A challenge can have at most 20 flags');
    }
    const sequenceSet = new Set<number>();

    for (const f of flags) {
      if (!f || typeof f !== 'object' || !Number.isInteger(f.sequence) || f.sequence < 1) {
        throw ApiError.badRequest('Each multi-flag entry must have a sequence number starting from 1');
      }

      if (sequenceSet.has(f.sequence)) {
        throw ApiError.badRequest('Duplicate sequence found in flags array');
      }
      sequenceSet.add(f.sequence);

      if (typeof f.value !== 'string' || !FLAG_REGEX.test(f.value.trim()) || f.value.trim().length > 500) {
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
    ? hints.map((hint: unknown) => {
        if (typeof hint === 'string') {
          if (hint.length > 1000) throw ApiError.badRequest('Hint content cannot exceed 1000 characters');
          return { content: hint.trim(), cost: 0 };
        }
        if (!hint || typeof hint !== 'object' || !('content' in hint) || typeof hint.content !== 'string' || hint.content.length > 1000) {
          throw ApiError.badRequest('Each hint must have valid content under 1000 characters');
        }
        const cost = 'cost' in hint && hint.cost !== undefined ? hint.cost : 0;
        if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost > 10000) {
          throw ApiError.badRequest('Hint cost must be a number between 0 and 10000');
        }
        return { content: hint.content.trim(), cost };
      }).filter((hint) => hint.content.length > 0)
    : [];

  // Build attachments array if provided
  const parsedAttachments = Array.isArray(attachments)
    ? attachments.map((attachment: unknown) => {
        if (typeof attachment !== 'string' || attachment.length > 2048) {
          throw ApiError.badRequest('Each attachment must be a string under 2048 characters');
        }
        return attachment.trim();
      }).filter(Boolean)
    : [];
  if (parsedAttachments.length + uploadedFiles.length > 10) {
    throw ApiError.badRequest('A challenge can have at most 10 attachments');
  }

  const isAdminSubmission = hasPermission(req.user?.role, 'challenges.write');

  const challengeData: any = {
    title: title.trim(),
    description: description.trim(),
    challengeUrl: challengeUrl.data || undefined,
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

  const uploadedKeys: string[] = [];
  let challenge: IChallengeDocument;
  try {
    const uploadedAttachments: IChallengeAttachment[] = [];

    for (const file of uploadedFiles) {
      const originalName = cleanOriginalFileName(file.originalname) || 'challenge-file';
      const extension = extname(originalName).toLowerCase();
      const fileKey = `challenges/${randomUUID()}/${randomUUID()}${extension}`;
      const contentType = CHALLENGE_FILE_CONTENT_TYPES[extension];
      const sha256 = await getFileSha256(file.path);

      await uploadToR2(fileKey, file.path, contentType, file.size);
      uploadedKeys.push(fileKey);
      uploadedAttachments.push({
        _id: randomUUID(),
        fileKey,
        originalName,
        size: file.size,
        sha256,
        contentType,
      });
    }

    challengeData.attachments = [...parsedAttachments, ...uploadedAttachments];
    challenge = await Challenge.create(challengeData);
  } catch (error) {
    await cleanupR2Uploads(uploadedKeys);
    throw error;
  }

  let emailsQueued = false;
  if (isAdminSubmission) {
    try { await enqueueChallengeEmail(challenge._id.toString(), challenge.title, challenge.description); emailsQueued = true; }
    catch { logger.error('Challenge created, but member email queueing failed. Republish to retry.'); }
  }
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
    const admins = await User.find({ role: { $in: ROLES.filter(role => hasPermission(role, 'challenges.review')) }, isBanned: false }).select('_id');
    const submitter = await User.findById(req.user!._id).select('username');
    const submitterUsername = submitter?.username || 'A user';
    const adminTemplate = notificationTemplates.challengeSubmissionNotification(submitterUsername, challenge.title);

    await sendChallengeSubmissionEmail({
      challengeTitle: challenge.title,
      submitterUsername,
    });

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
      ...(isAdminSubmission ? { emailsQueued } : {}),
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
