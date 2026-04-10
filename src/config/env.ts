import { z } from 'zod'

// ── Schema ────────────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_COOKIE_EXPIRES_IN: z.coerce.number().default(7),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Admin seed
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_USERNAME: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
})

// ── Parse & validate ──────────────────────────────────────────────
const _parsed = envSchema.safeParse(process.env)

if (!_parsed.success) {
  console.error('Invalid environment variables:')
  console.error(_parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = _parsed.data
export type Env = typeof env
