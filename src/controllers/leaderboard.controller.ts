import { Request, Response } from 'express';
import { User } from '../models/User';
import { Submission } from '../models/Submission';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * @desc    Get leaderboard data with filters (all-time, weekly, monthly)
 * @route   GET /api/v1/leaderboard
 * @access  Public
 */
export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const filter = (req.query.filter as string) || 'all-time';
  
  let leaderboard;

  if (filter === 'all-time') {
    // Top users by their total score in User model
    leaderboard = await User.find({})
      .sort({ score: -1, updatedAt: 1 })
      .limit(50)
      .select('username avatar score country');
      
    // Add Rank
    leaderboard = leaderboard.map((user, index) => ({
      rank: index + 1,
      userId: user._id,
      username: user.username,
      avatar: user.avatar,
      score: user.score,
      country: user.country
    }));
  } else {
    // Time-based aggregation from Submissions
    const now = new Date();
    let startDate = new Date();
    
    if (filter === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else if (filter === 'monthly') {
      startDate.setMonth(now.getMonth() - 1);
    }

    leaderboard = await Submission.aggregate([
      {
        $match: {
          isCorrect: true,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          score: { $sum: '$pointsAwarded' },
          solveCount: { $sum: 1 },
          lastSolveAt: { $max: '$timestamp' }
        }
      },
      { $sort: { score: -1, lastSolveAt: 1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          username: '$userDetails.username',
          avatar: '$userDetails.avatar',
          country: '$userDetails.country',
          score: 1,
          solveCount: 1
        }
      }
    ]);

    // Add Rank
    leaderboard = leaderboard.map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }

  res.status(200).json(ApiResponse.ok('Leaderboard retrieved successfully', leaderboard));
});
