import { z } from 'zod'

// ── Schema ────────────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Private challenge file storage
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET: z.string().min(1, 'R2_BUCKET is required'),

  // Optional stable secret for recoverable, administrator-only flag storage.
  FLAG_ENCRYPTION_SECRET: z.string().min(32).optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_COOKIE_EXPIRES_IN: z.coerce.number().int().min(1).max(365).default(7),
  JWT_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  JWT_COOKIE_SECURE: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ALLOW_VERCEL_PREVIEWS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),

  // Set to 1 when running behind a single trusted reverse proxy/load balancer.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(86400000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(100),

  // Admin seed
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_USERNAME: z.string().optional(),

  // Optional SMTP settings for admin submission alerts (all content types)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SUPPORT_NOTIFICATION_EMAIL: z.preprocess(value => value === '' ? undefined : value, z.string().email().optional()),
  CHALLENGE_NOTIFICATION_EMAIL: z.string().email().optional(), // Shared recipient for challenges, writeups, resources and projects

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' && values.JWT_SECRET.startsWith('replace-with-')) {
    context.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Replace the example JWT secret before production deployment' })
  }

  if (values.NODE_ENV === 'production' && values.JWT_COOKIE_SECURE === false) {
    context.addIssue({ code: 'custom', path: ['JWT_COOKIE_SECURE'], message: 'Secure cookies are required in production' })
  }

  if (values.JWT_COOKIE_SAME_SITE === 'none' && values.JWT_COOKIE_SECURE === false) {
    context.addIssue({ code: 'custom', path: ['JWT_COOKIE_SECURE'], message: 'SameSite=None cookies require Secure=true' })
  }
})

// ── Parse & validate ──────────────────────────────────────────────
const requiredR2Variables = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const
const missingR2Variables = requiredR2Variables.filter((name) => !process.env[name]?.trim())

if (missingR2Variables.length > 0) {
  console.error(`Missing required environment variables: ${missingR2Variables.join(', ')}`)
  throw new Error('R2 environment configuration is incomplete')
}

const _parsed = envSchema.safeParse(process.env)

if (!_parsed.success) {
  console.error('Invalid environment variables:')
  console.error(_parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = _parsed.data
export type Env = typeof env
