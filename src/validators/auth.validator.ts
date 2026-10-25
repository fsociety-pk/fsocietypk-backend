import { z } from 'zod';

/**
 * ── Registration Schema ───────────────────────────────────────────
 * Enforces:
 * - min 3 chars for username
 * - min 8 chars password
 * - at least 1 uppercase, 1 lowercase, 1 number, 1 special character
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  username: z
    .string().trim().toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must be at most 72 bytes'),
});

/**
 * ── Login Schema ──────────────────────────────────────────────────
 */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Username or email is required').max(254).refine(value => value.includes('@') ? z.string().email().safeParse(value).success : /^[a-zA-Z0-9_-]{3,30}$/.test(value), 'Enter a valid username or email address'),
  password: z.string().min(1, 'Password is required').max(256),
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
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'New password must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'New password must contain at least one special character')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'New password must be at most 72 bytes'),
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

// The profile UI submits a resized raster image. Never accept SVG or arbitrary data URLs.
export const avatarSchema = z.string().max(700_000, 'Photo must be smaller than 512 KB').refine(value => {
  if (!value || safeProfileUrl.safeParse(value).success) return true;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 512 * 1024 || bytes.length < 12) return false;
  if (match[1] === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (match[1] === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}, 'Choose a valid JPG, PNG or WebP photo, or an HTTP(S) image URL');

export const verifyEmailSchema = z.object({
  registrationId: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your email'),
});
export const resendOtpSchema = verifyEmailSchema.pick({ registrationId: true });

export const updateUserProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  avatar: avatarSchema.optional(),
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

