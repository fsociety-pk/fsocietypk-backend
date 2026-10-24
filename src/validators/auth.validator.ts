import { z } from 'zod';

/**
 * ── Registration Schema ───────────────────────────────────────────
 * Enforces:
 * - min 3 chars for username
 * - min 8 chars password
 * - at least 1 uppercase, 1 lowercase, 1 number, 1 special character
 */
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must be at most 72 bytes')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

/**
 * ── Login Schema ──────────────────────────────────────────────────
 */
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * ── Password Change Schema ────────────────────────────────────────
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'New password must be at most 72 bytes')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'New password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'New password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const safeProfileUrl = z.string().max(2048).refine((value) => {
  if (!value) return true;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'URL must use HTTP or HTTPS');

export const updateUserProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  avatar: safeProfileUrl.optional(),
  bio: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  isProfilePublic: z.boolean().optional(),
  socialLinks: z.object({
    linkedin: safeProfileUrl.optional(),
    github: safeProfileUrl.optional(),
    instagram: safeProfileUrl.optional(),
  }).optional(),
}).strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

