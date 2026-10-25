import { z } from 'zod';

export const challengeUrlSchema = z.string().trim().max(2048, 'Challenge URL cannot exceed 2048 characters')
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Enter a valid http:// or https:// challenge URL without embedded credentials')
  .optional();
