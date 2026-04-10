import { z } from 'zod';

export const updateAdminProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'NAME_REQUIRED').max(50, 'NAME_TOO_LONG'),
    bio: z.string().min(1, 'BIO_REQUIRED').max(1000, 'BIO_TOO_LONG'),
    profileImage: z.string().url('INVALID_IMAGE_URL').or(z.literal('')),
    links: z.object({
      github: z.string().url('INVALID_GITHUB_URL').or(z.literal('')),
      linkedin: z.string().url('INVALID_LINKEDIN_URL').or(z.literal('')),
      portfolio: z.string().url('INVALID_PORTFOLIO_URL').or(z.literal('')),
    }).optional(),
    socialLinks: z.array(z.object({
      platform: z.string().min(1, 'PLATFORM_NAME_REQUIRED'),
      url: z.string().url('INVALID_SOCIAL_URL'),
    })).optional(),
  }),
});
