import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AdminProfile } from '../models/AdminProfile';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';

/**
 * @desc    Get Admin Profile info
 * @route   GET /api/v1/admin-profile
 * @access  Private
 */
export const getAdminProfile = asyncHandler(async (_req: Request, res: Response) => {
  // First try to find by the singleton slug
  let profile = await AdminProfile.findOne({ slug: 'main' });
  
  // Migration fallback: If not found by slug, find the first available document
  if (!profile) {
    profile = await AdminProfile.findOne();
    
    // If we found a legacy profile without a slug, upgrade it to the singleton pattern
    if (profile) {
      profile.slug = 'main';
      await profile.save();
      console.log('--- ADMIN_PROFILE_MIGRATED_TO_SINGLETON ---');
    }
  }
  
  res.status(200).json(ApiResponse.ok('Admin profile retrieved', profile || {}));
});

/**
 * @desc    Update Admin Profile info
 * @route   PUT /api/v1/admin-profile
 * @access  Private/Admin
 */
export const updateAdminProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, bio, profileImage, links, socialLinks } = req.body;

  const dbName = mongoose.connection.name;
  logger.info(`--- ADMIN_PROFILE_SYNC_INITIATED [DB: ${dbName}] ---`);
  logger.debug('Payload:', { name, bio, profileImage });

  const profile = await AdminProfile.findOneAndUpdate(
    { slug: 'main' },
    {
      name,
      bio,
      profileImage,
      links,
      socialLinks,
      slug: 'main'
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  logger.info('--- ADMIN_PROFILE_SYNC_COMPLETE ---');
  res.status(200).json(ApiResponse.ok('Admin profile updated successfully', profile));
});
