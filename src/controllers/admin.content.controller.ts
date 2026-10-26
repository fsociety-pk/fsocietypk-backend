import { Request, Response } from 'express';
import { z } from 'zod';
import { Resource } from '../models/Resource';
import { Writeup } from '../models/Writeup';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

const querySchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(10) });
export const getWriteups = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest('Invalid moderation filter', parsed.error.issues);
  const { status, page, limit } = parsed.data;
  const filter = status === 'all' ? {} : { status };
  const [writeups, total] = await Promise.all([Writeup.find(filter).populate('userId', 'username avatar').populate('challengeId', 'title category').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Writeup.countDocuments(filter)]);
  res.json(ApiResponse.ok('Writeups retrieved', { writeups, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }));
});
export const getResources = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success || parsed.data.status === 'rejected') throw ApiError.badRequest('Invalid resource filter');
  const { status } = parsed.data;
  const resources = await Resource.find(status === 'all' ? {} : { isApproved: status === 'approved' }).populate('createdBy', 'username avatar').sort({ createdAt: -1 });
  res.json(ApiResponse.ok('Resources retrieved', resources));
});
