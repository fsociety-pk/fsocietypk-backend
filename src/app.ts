import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'
const xss = require('xss-clean')
import { env } from './config/env'
import logger from './utils/logger'
import { isOriginAllowed } from './utils/cors'
import { errorHandler } from './middleware/error.middleware'

// ── Route imports (added as they are built) ──────────────────────
import authRoutes from './routes/auth.routes'
import challengeRoutes from './routes/challenge.routes'
import userRoutes from './routes/user.routes'
import adminRoutes from './routes/admin.routes'
import adminProfileRoutes from './routes/adminProfile.routes'
import leaderboardRoutes from './routes/leaderboard.routes'
import notificationRoutes from './routes/notification.routes'
import projectRoutes from './routes/project.routes'


const app: Application = express()

const normalizePrefix = (prefix: string): string => {
  const trimmed = prefix.trim()
  if (!trimmed) return '/api'

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/api'
}

const apiPrefix = normalizePrefix(env.API_PREFIX)

// ── Security middleware ───────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}))

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ── Rate limiting ────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
})
app.use(globalLimiter)

// ── Auth-specific rate limiting ───────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 login/signup requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
})

// ── NoSQL Injection Prevention ────────────────────────────────────
app.use(mongoSanitize())

// ── XSS Prevention ────────────────────────────────────────────────
app.use(xss())

// ── HTTP Parameter Pollution ──────────────────────────────────────
app.use(hpp())

// ── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ── HTTP logger ───────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message: string) => logger.http(message.trim()) },
  }))
}

// ── Health check ──────────────────────────────────────────────────
const healthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'FsocietyPK API is operational',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  })
}

app.get('/health', healthHandler)

// ── API Routes ────────────────────────────────────────────────────
app.get(apiPrefix, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'FsocietyPK API root',
    baseUrl: apiPrefix,
    modules: ['auth', 'challenges', 'users', 'admin', 'admin-profile', 'leaderboard', 'notifications', 'projects'],
    health: `${apiPrefix}/health`,
  })
})

app.get(`${apiPrefix}/health`, healthHandler)

app.use(`${apiPrefix}/auth`, authLimiter, authRoutes)
app.use(`${apiPrefix}/challenges`, challengeRoutes)
app.use(`${apiPrefix}/users`, userRoutes)
app.use(`${apiPrefix}/admin`, adminRoutes)
app.use(`${apiPrefix}/admin-profile`, adminProfileRoutes)
app.use(`${apiPrefix}/leaderboard`, leaderboardRoutes)
app.use(`${apiPrefix}/notifications`, notificationRoutes)
app.use(`${apiPrefix}/projects`, projectRoutes)


// ── 404 handler ───────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    method: req.method,
    path: req.originalUrl,
  })
})

// ── Global error handler ──────────────────────────────────────────
app.use(errorHandler)

export default app
