import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'USERNAME_REQUIRED').max(30, 'USERNAME_TOO_LONG'),
    password: z.string().min(1, 'PASSWORD_REQUIRED').max(256, 'PASSWORD_TOO_LONG'),
  }),
});

export const signupSchema = z.object({
  body: z.object({
    username: z.string()
      .min(3, 'USERNAME_MIN_3_CHARS')
      .max(30, 'USERNAME_MAX_30_CHARS')
      .regex(/^[a-zA-Z0-9_-]+$/, 'USERNAME_INVALID_CHARACTERS'),
    password: z.string()
      .min(8, 'PASSWORD_MINIMUM_LENGTH_8')
      .regex(/[A-Z]/, 'PASSWORD_UPPERCASE_REQUIRED')
      .regex(/[a-z]/, 'PASSWORD_LOWERCASE_REQUIRED')
      .regex(/[0-9]/, 'PASSWORD_NUMBER_REQUIRED')
      .regex(/[^a-zA-Z0-9]/, 'PASSWORD_SPECIAL_CHAR_REQUIRED')
      .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'PASSWORD_MAX_BCRYPT_LENGTH_72_BYTES'),
  }),
});
