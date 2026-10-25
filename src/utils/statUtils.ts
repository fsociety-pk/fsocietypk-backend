import { Challenge } from '../models/Challenge';
import mongoose from 'mongoose';
import { ChallengeProgress, getUserChallengeProgress } from './challengeProgress';

export const calculateProficiencyIndex = async (userId: string | mongoose.Types.ObjectId, progress?: ChallengeProgress[]) => {
  // Total challenges per category
  const totalInCategory = await Challenge.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: '$category', total: { $sum: 1 } } }
  ]);

  // User's solved challenges per category
  const completed = (progress ?? await getUserChallengeProgress(userId))
    .filter(p => p.isSolved && p.challenge.status === 'approved');

  // Combined into a readable format - only include categories that have at least one challenge
  const stats = totalInCategory.map(t => {
    const cat = t._id;
    const solved = completed.filter(p => p.challenge.category === cat).length;
    return {
      category: cat,
      solved,
      total: t.total
    };
  }).sort((a, b) => b.total - a.total);

  return stats;
};
