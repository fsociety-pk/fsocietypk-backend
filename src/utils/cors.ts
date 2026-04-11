import { env } from '../config/env'

const STATIC_ALLOWED_ORIGINS = [
  'https://fsocietypk.tech',
  'https://www.fsocietypk.tech',
  'http://fsocietypk.tech',
  'http://www.fsocietypk.tech',
]

const envAllowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const allowedOrigins = Array.from(new Set([...envAllowedOrigins, ...STATIC_ALLOWED_ORIGINS]))

const VERCEL_PREVIEW_REGEX = /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i

export const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true

  if (allowedOrigins.includes(origin)) {
    return true
  }

  if (env.CORS_ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_REGEX.test(origin)) {
    return true
  }

  return false
}
