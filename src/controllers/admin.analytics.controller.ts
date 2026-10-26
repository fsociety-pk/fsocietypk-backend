import { Request, Response } from 'express';
import { User } from '../models/User';
import { Challenge } from '../models/Challenge';
import { Submission } from '../models/Submission';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { challengeProgressPipeline } from '../utils/challengeProgress';

/**
 * @desc    Get detailed platform analytics
 * @route   GET /api/v1/admin/analytics
 * @access  Private/Admin
 */
export const getAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Helper to generate the last 30 dates in YYYY-MM-DD
  const generateLast30Days = () => {
    const dates = [];
    const d = new Date();
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(d);
      dt.setDate(dt.getDate() - i);
      dates.push(dt.toISOString().split('T')[0]);
    }
    return dates;
  };
  const last30Days = generateLast30Days();

  const [
    overview,
    userGrowthRaw,
    submissionTrendRaw,
    topChallenges,
    categoryStats,
    difficultyStats
  ] = await Promise.all([
    // 1. Overview
    Promise.all([
      User.countDocuments({ role: 'user' }),
      Challenge.countDocuments({ status: 'approved' }),
      Submission.aggregate([
        ...challengeProgressPipeline(),
        { $match: { isSolved: true } },
        { $count: 'count' },
      ]).then(rows => rows[0]?.count ?? 0)
    ]).then(([users, challenges, solves]) => ({
      totalUsers: users,
      totalChallenges: challenges,
      totalSolves: solves
    })),

    // 2. User Growth (last 30 days)
    User.aggregate([
      { $match: { role: 'user', createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, _id: 0 } }
    ]),

    // 3. Submission Trend (last 30 days)
    Submission.aggregate([
      ...challengeProgressPipeline(),
      { $match: { completedAt: { $gte: thirtyDaysAgo }, isSolved: true } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
          solves: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", solves: 1, _id: 0 } }
    ]),

    // 4. Top Challenges
    Challenge.aggregate([
      { $match: { status: 'approved' } },
      { $lookup: {
        from: 'submissions', localField: '_id', foreignField: 'challengeId',
        pipeline: [
          ...challengeProgressPipeline(),
          { $match: { isSolved: true } },
          { $count: 'count' },
        ],
        as: 'solves',
      } },
      { $project: { title: 1, category: 1, solveCount: { $ifNull: [{ $first: '$solves.count' }, 0] } } },
      { $sort: { solveCount: -1, title: 1 } },
      { $limit: 5 },
    ]),

    // 5. Category Distribution
    Submission.aggregate([
      ...challengeProgressPipeline(),
      { $match: { isSolved: true } },
      {
        $group: {
          _id: '$challenge.category',
          count: { $sum: 1 }
        }
      },
      { $project: { category: "$_id", count: 1, _id: 0 } }
    ]),

    // 6. Difficulty Distribution
    Submission.aggregate([
        ...challengeProgressPipeline(),
        { $match: { isSolved: true } },
        {
          $group: {
            _id: '$challenge.difficulty',
            count: { $sum: 1 }
          }
        },
        { $project: { difficulty: "$_id", count: 1, _id: 0 } }
      ])
  ]);

  const userGrowth = last30Days.map(date => {
    const found = userGrowthRaw.find((d: any) => d.date === date);
    return { date, count: found ? found.count : 0 };
  });

  const submissionTrend = last30Days.map(date => {
    const found = submissionTrendRaw.find((d: any) => d.date === date);
    return { date, solves: found ? found.solves : 0 };
  });

  res.status(200).json(ApiResponse.ok('Analytics retrieved successfully', {
    overview,
    userGrowth,
    submissionTrend,
    topChallenges,
    categoryStats,
    difficultyStats
  }));
});
