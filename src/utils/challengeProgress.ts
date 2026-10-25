import mongoose, { PipelineStage } from 'mongoose';
import { Submission } from '../models/Submission';

/** One row per user/challenge, regardless of how many flags or retries it has. */
export const challengeProgressPipeline = (match: Record<string, unknown> = {}): Exclude<PipelineStage, PipelineStage.Merge | PipelineStage.Out>[] => [
  { $match: { ...match, isCorrect: true } },
  // Old data may contain repeated successful submissions for the same flag.
  {
    $group: {
      _id: { userId: '$userId', challengeId: '$challengeId', sequence: { $ifNull: ['$sequenceNumber', 0] } },
      pointsAwarded: { $max: '$pointsAwarded' },
      timestamp: { $min: '$timestamp' },
    },
  },
  {
    $group: {
      _id: { userId: '$_id.userId', challengeId: '$_id.challengeId' },
      sequences: { $addToSet: '$_id.sequence' },
      pointsAwarded: { $sum: '$pointsAwarded' },
      timestamp: { $max: '$timestamp' },
    },
  },
  {
    $lookup: {
      from: 'challenges',
      localField: '_id.challengeId',
      foreignField: '_id',
      pipeline: [{ $project: {
        title: 1, category: 1, difficulty: 1, points: 1, slug: 1, status: 1,
        requiredSequences: { $cond: [
          { $gt: [{ $size: { $ifNull: ['$flags', []] } }, 0] },
          { $map: { input: '$flags', as: 'flag', in: '$$flag.sequence' } },
          [0],
        ] },
      } }],
      as: 'challenge',
    },
  },
  { $unwind: '$challenge' },
  { $set: {
    completedSequences: { $setIntersection: ['$sequences', '$challenge.requiredSequences'] },
    totalFlags: { $size: '$challenge.requiredSequences' },
    isSolved: { $setIsSubset: ['$challenge.requiredSequences', '$sequences'] },
  } },
  { $set: {
    completedFlags: { $size: '$completedSequences' },
    completedAt: { $cond: ['$isSolved', '$timestamp', null] },
  } },
  // Only counts and sequence numbers leave the database, never flag hashes.
  { $project: { sequences: 0, 'challenge.requiredSequences': 0 } },
];

export interface ChallengeProgress {
  _id: { userId: mongoose.Types.ObjectId; challengeId: mongoose.Types.ObjectId };
  challenge: {
    _id: mongoose.Types.ObjectId;
    title: string;
    category: string;
    difficulty: string;
    points: number;
    slug: string;
    status: string;
  };
  completedSequences: number[];
  completedFlags: number;
  totalFlags: number;
  isSolved: boolean;
  completedAt: Date | null;
  timestamp: Date;
  pointsAwarded: number;
}

export const getUserChallengeProgress = (userId: string | mongoose.Types.ObjectId, challengeId?: string) =>
  Submission.aggregate<ChallengeProgress>(challengeProgressPipeline({
    userId: new mongoose.Types.ObjectId(userId.toString()),
    ...(challengeId ? { challengeId: new mongoose.Types.ObjectId(challengeId) } : {}),
  }));

export const profileSolveData = (progress: ChallengeProgress[]) => {
  const completed = progress.filter(p => p.isSolved)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return {
    solvedChallenges: completed.map(p => p.challenge),
    solveHistory: completed.slice(0, 20).map(p => ({
      _id: p.challenge._id,
      challengeId: p.challenge,
      isCorrect: true,
      pointsAwarded: p.pointsAwarded,
      timestamp: p.completedAt,
    })),
    challengeProgress: progress.filter(p => !p.isSolved && p.totalFlags > 1 && p.completedFlags > 0)
      .map(p => ({
        challengeId: p.challenge,
        completedFlags: p.completedFlags,
        totalFlags: p.totalFlags,
      })),
  };
};
