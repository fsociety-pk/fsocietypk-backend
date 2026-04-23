import { Request, Response } from 'express';
import { Resource } from '../models/Resource';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * @desc    Submit a new learning resource
 * @route   POST /api/v1/resources
 * @access  Private
 */
export const submitResource = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, githubLink, category } = req.body;

  // Validation
  if (!title || !description || !githubLink || !category) {
    throw ApiError.badRequest('Title, description, GitHub link, and category are required');
  }

  // Validate GitHub link format
  if (!githubLink.includes('github.com')) {
    throw ApiError.badRequest('Please provide a valid GitHub repository link');
  }

  const resource = await Resource.create({
    title,
    description,
    githubLink,
    category: category.toLowerCase(),
    createdBy: req.user!._id,
    isApproved: false,
  });

  res.status(201).json(ApiResponse.created('Resource submitted successfully for review', resource));
});

/**
 * @desc    Get all approved resources
 * @route   GET /api/v1/resources
 * @access  Public
 */
export const getApprovedResources = asyncHandler(async (_req: Request, res: Response) => {
  const resources = await Resource.find({ isApproved: true })
    .populate('createdBy', 'username avatar')
    .sort({ createdAt: -1 });

  res.status(200).json(ApiResponse.ok('Resources retrieved successfully', resources));
});

/**
 * @desc    Get resources by category
 * @route   GET /api/v1/resources/category/:category
 * @access  Public
 */
export const getResourcesByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.params;

  const resources = await Resource.find({
    category: category.toLowerCase(),
    isApproved: true,
  })
    .populate('createdBy', 'username avatar')
    .sort({ createdAt: -1 });

  if (resources.length === 0) {
    throw ApiError.notFound(`No resources found for category: ${category}`);
  }

  res.status(200).json(ApiResponse.ok('Resources retrieved successfully', resources));
});

/**
 * @desc    Get pending resources (admin only)
 * @route   GET /api/v1/admin/resources/pending
 * @access  Private/Admin
 */
export const getPendingResources = asyncHandler(async (_req: Request, res: Response) => {
  const resources = await Resource.find({ isApproved: false })
    .populate('createdBy', 'username avatar')
    .sort({ createdAt: -1 });

  res.status(200).json(ApiResponse.ok('Pending resources retrieved successfully', resources));
});

/**
 * @desc    Approve a resource (admin only)
 * @route   PATCH /api/v1/admin/resources/:id/approve
 * @access  Private/Admin
 */
export const approveResource = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const resource = await Resource.findByIdAndUpdate(
    id,
    { isApproved: true },
    { new: true }
  ).populate('createdBy', 'username avatar');

  if (!resource) {
    throw ApiError.notFound('Resource not found');
  }

  res.status(200).json(ApiResponse.ok('Resource approved successfully', resource));
});

/**
 * @desc    Reject/Delete a resource (admin only)
 * @route   DELETE /api/v1/admin/resources/:id
 * @access  Private/Admin
 */
export const deleteResource = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const resource = await Resource.findByIdAndDelete(id);

  if (!resource) {
    throw ApiError.notFound('Resource not found');
  }

  res.status(200).json(ApiResponse.ok('Resource deleted successfully', resource));
});

/**
 * @desc    Get user's submitted resources
 * @route   GET /api/v1/resources/my-submissions
 * @access  Private
 */
export const getMyResources = asyncHandler(async (req: Request, res: Response) => {
  const resources = await Resource.find({ createdBy: req.user!._id })
    .populate('createdBy', 'username avatar')
    .sort({ createdAt: -1 });

  res.status(200).json(ApiResponse.ok('Your resources retrieved successfully', resources));
});
