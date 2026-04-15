import { Request, Response } from 'express';
import { User } from '../models/User';
import { Submission } from '../models/Submission';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { changePasswordSchema } from '../validators/auth.validator';

/**
 * @desc    Get current user profile with rank and solve history
 * @route   GET /api/v1/users/me/profile
 * @access  Private
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;

  // 1. Fetch user and populate solved challenges
  const user = await User.findById(userId)
    .populate({
      path: 'solvedChallenges',
      select: 'title category points difficulty slug'
    });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Calculate Rank
  // Rank is 1 + number of users with a strictly higher score
  const rank = await User.countDocuments({ score: { $gt: user.score } }) + 1;

  // 3. Fetch recent solve history (from Submissions)
  const solveHistory = await Submission.find({ 
    userId: userId, 
    isCorrect: true 
  })
    .sort({ timestamp: -1 })
    .limit(20)
    .populate('challengeId', 'title category points');

  const profileData = {
    ...user.toObject(),
    rank,
    solveHistory
  };

  res.status(200).json(ApiResponse.ok('Profile retrieved successfully', profileData));
});

/**
 * @desc    Get public user profile by username
 * @route   GET /api/v1/users/:username/profile
 * @access  Public
 */
export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;

  // 1. Fetch user by username
  const user = await User.findOne({ 
    username: username.toLowerCase() 
  })
    .populate({
      path: 'solvedChallenges',
      select: 'title category points difficulty slug'
    });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Check if profile is public
  if (!user.isProfilePublic) {
    throw ApiError.forbidden('This user\'s profile is private');
  }

  // 3. Calculate Rank
  const rank = await User.countDocuments({ score: { $gt: user.score } }) + 1;

  // 4. Fetch recent solve history (from Submissions)
  const solveHistory = await Submission.find({ 
    userId: user._id, 
    isCorrect: true 
  })
    .sort({ timestamp: -1 })
    .limit(20)
    .populate('challengeId', 'title category points');

  // 5. Return only public data
  const profileData = {
    _id: user._id,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    country: user.country,
    socialLinks: user.socialLinks,
    score: user.score,
    role: user.role,
    createdAt: user.createdAt,
    solvedChallenges: user.solvedChallenges,
    rank,
    solveHistory
  };

  res.status(200).json(ApiResponse.ok('Public profile retrieved successfully', profileData));
});

/**
 * @desc    Update user profile (avatar, bio, country, social links)
 * @route   PUT /api/v1/users/me/profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { avatar, bio, country, socialLinks, isProfilePublic } = req.body;

  // 1. Find user
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Update allowed fields
  if (avatar !== undefined) user.avatar = avatar;
  if (bio !== undefined) user.bio = bio;
  if (country !== undefined) user.country = country;
  if (isProfilePublic !== undefined) user.isProfilePublic = isProfilePublic;
  
  if (socialLinks !== undefined) {
    user.socialLinks = {
      linkedin: socialLinks.linkedin || '',
      github: socialLinks.github || '',
      instagram: socialLinks.instagram || '',
    };
  }

  // 3. Save updated user
  await user.save();

  const profileData = {
    ...user.toObject(),
    message: 'Profile updated successfully'
  };

  res.status(200).json(ApiResponse.ok('Profile updated successfully', profileData));
});

/**
 * @desc    Change user password
 * @route   POST /api/v1/users/me/change-password
 * @access  Private
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate Input
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid password data', result.error.errors);
  }

  const { currentPassword, newPassword } = result.data;

  // 2. Find user (include password for comparison)
  const user = await User.findById(req.user!._id).select('+password');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 3. Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  // 4. Check if new password is different from old password
  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from current password');
  }

  // 5. Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json(ApiResponse.ok('Password updated successfully', null));
});
