import { z } from 'zod';
import { challengeUrlSchema } from './challenge.schema';
import { ROLES } from '../utils/roles';
export const adminIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(80).default(''),
  status: z.enum(['all', 'active', 'banned']).default('all'),
  role: z.enum(['user', 'staff', 'all']).default('user'),
});
export const adminRoleUpdateSchema = z.object({ role: z.enum(ROLES) }).strict();
export const adminChallengeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(12000).optional(),
  challengeUrl: challengeUrlSchema,
  category: z.enum(['web', 'pwn', 'rev', 'crypto', 'forensics', 'osint', 'misc', 'stego', 'network', 'mobile']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'insane']).optional(),
  hints: z.array(z.object({ content: z.string().trim().min(1).max(1000), cost: z.number().min(0).max(10000).default(0) })).max(20).optional(),
  flags: z.array(z.object({ sequence: z.number().int().min(1).max(20), value: z.string().trim().max(500).regex(/^fsociety\{.+\}$/i) })).min(1).max(20).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required')
  .refine(value => !value.flags || value.flags.every((flag, index) => flag.sequence === index + 1), 'Flags must be ordered continuously from 1');
export const adminStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  rejectionReason: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
}).strict();
export const adminAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
  targetRole: z.enum(['all', 'staff', ...ROLES]).default('all'),
}).strict();
