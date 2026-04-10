import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('INVALID_EMAIL_FORMAT'),
    password: z.string().min(8, 'PASSWORD_MINIMUM_LENGTH_8'),
  }),
});

export const signupSchema = z.object({
  body: z.object({
    username: z.string()
      .min(3, 'USERNAME_MIN_3_CHARS')
      .max(30, 'USERNAME_MAX_30_CHARS')
      .regex(/^[a-zA-Z0-9_-]+$/, 'USERNAME_INVALID_CHARACTERS'),
    email: z.string().email('INVALID_EMAIL_FORMAT'),
    password: z.string().min(8, 'PASSWORD_MINIMUM_LENGTH_8'),
  }),
});
