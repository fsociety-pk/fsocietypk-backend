import { Submission } from '../models/Submission';
import { Challenge } from '../models/Challenge';
import mongoose from 'mongoose';

export const calculateProficiencyIndex = async (userId: string | mongoose.Types.ObjectId) => {
  // Total challenges per category
  const totalInCategory = await Challenge.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: '$category', total: { $sum: 1 } } }
  ]);

  // User's solved challenges per category
  const solvedInCategory = await Submission.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId.toString()), isCorrect: true } },
    {
      $lookup: {
        from: 'challenges',
        localField: 'challengeId',
        foreignField: '_id',
        as: 'challenge'
      }
    },
    { $unwind: '$challenge' },
    { $group: { _id: '$challenge.category', solved: { $sum: 1 } } }
  ]);

  // Combined into a readable format - only include categories that have at least one challenge
  const stats = totalInCategory.map(t => {
    const cat = t._id;
    const solved = solvedInCategory.find(s => s._id === cat)?.solved || 0;
    return {
      category: cat,
      solved,
      total: t.total
    };
  }).sort((a, b) => b.total - a.total);

  return stats;
};
