import { Request, Response } from 'express';
import { User } from '../models/User';
import { getUserChallengeProgress, profileSolveData } from '../utils/challengeProgress';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { changePasswordSchema, updateUserProfileSchema } from '../validators/auth.validator';
import { calculateProficiencyIndex } from '../utils/statUtils';
import { env } from '../config/env';

/**
 * @desc    Get current user profile with rank and solve history
 * @route   GET /api/v1/users/me/profile
 * @access  Private
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id;

  const user = await User.findById(userId);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Calculate Rank
  // Rank is 1 + number of users with a strictly higher score
  const rank = await User.countDocuments({ role: 'user', isBanned: false, score: { $gt: user.score } }) + 1;

  // 3. Fetch recent solve history (from Submissions)
  const progress = await getUserChallengeProgress(userId);
  const solveData = profileSolveData(progress);
  const proficiencyIndex = await calculateProficiencyIndex(userId, progress);

  const profileData = {
    ...user.toObject(),
    rank,
    ...solveData,
    proficiencyIndex
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
  const user = await User.findOne({ username: username.toLowerCase(), role: 'user', isBanned: false });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Check if profile is public
  if (!user.isProfilePublic) {
    throw ApiError.forbidden('This user\'s profile is private');
  }

  // 3. Calculate Rank
  const rank = await User.countDocuments({ role: 'user', isBanned: false, score: { $gt: user.score } }) + 1;

  // 4. Fetch recent solve history (from Submissions)
  const progress = await getUserChallengeProgress(user._id);
  const solveData = profileSolveData(progress);
  const proficiencyIndex = await calculateProficiencyIndex(user._id, progress);

  // 6. Return only public data
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
    rank,
    ...solveData,
    proficiencyIndex
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
  const parsed = updateUserProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid profile data', parsed.error.issues);
  }
  const { username, avatar, bio, country, socialLinks, isProfilePublic } = parsed.data;

  // 1. Find user
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // 2. Update allowed fields
  if (username !== undefined && username.toLowerCase() !== user.username) {
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      throw ApiError.badRequest('Username already taken');
    }
    user.username = username.toLowerCase();
  }

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

  const updatedUser = await User.findById(userId);

  // 5. Calculate Rank
  const rank = await User.countDocuments({ role: 'user', isBanned: false, score: { $gt: updatedUser!.score } }) + 1;

  // 6. Fetch recent solve history
  const progress = await getUserChallengeProgress(userId);
  const solveData = profileSolveData(progress);
  const proficiencyIndex = await calculateProficiencyIndex(userId, progress);

  const profileData = {
    ...updatedUser!.toObject(),
    rank,
    ...solveData,
    proficiencyIndex
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
    throw ApiError.badRequest('Invalid password data', result.error.issues);
  }

  const { currentPassword, newPassword } = result.data;

  // 2. Find user (include password for comparison)
  const user = await User.findById(req.user!._id).select('+password +sessionVersion');
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
  user.passwordChangedAt = new Date();
  user.$inc('sessionVersion', 1);
  await user.save();

  const secureCookie = env.JWT_COOKIE_SECURE ?? env.NODE_ENV === 'production';
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: secureCookie,
    sameSite: env.JWT_COOKIE_SAME_SITE,
  });

  res.status(200).json(ApiResponse.ok('Password updated. Please log in again.', null));
});
