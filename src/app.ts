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
import { errorHandler } from './middleware/error.middleware'

// ── Route imports (added as they are built) ──────────────────────
import authRoutes from './routes/auth.routes'
import challengeRoutes from './routes/challenge.routes'
import userRoutes from './routes/user.routes'
import adminRoutes from './routes/admin.routes'
import adminProfileRoutes from './routes/adminProfile.routes'
import leaderboardRoutes from './routes/leaderboard.routes'
import notificationRoutes from './routes/notification.routes'


const app: Application = express()

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
const allowVercelPreviews = env.CORS_ALLOW_VERCEL_PREVIEWS

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
    // Allow server-to-server and local non-browser requests without Origin header.
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    // Optional compatibility mode for Vercel preview and production domains.
    if (allowVercelPreviews && origin.endsWith('.vercel.app')) {
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
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'FsocietyPK API is operational',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  })
})

// ── API Routes ────────────────────────────────────────────────────
app.use(`${env.API_PREFIX}/auth`, authLimiter, authRoutes)
app.use(`${env.API_PREFIX}/challenges`, challengeRoutes)
app.use(`${env.API_PREFIX}/users`, userRoutes)
app.use(`${env.API_PREFIX}/admin`, adminRoutes)
app.use(`${env.API_PREFIX}/admin-profile`, adminProfileRoutes)
app.use(`${env.API_PREFIX}/leaderboard`, leaderboardRoutes)
app.use(`${env.API_PREFIX}/notifications`, notificationRoutes)

// Compatibility aliases for deployments where frontend base URL omits API_PREFIX.
app.use('/auth', authLimiter, authRoutes)
app.use('/challenges', challengeRoutes)
app.use('/users', userRoutes)
app.use('/admin', adminRoutes)
app.use('/admin-profile', adminProfileRoutes)
app.use('/leaderboard', leaderboardRoutes)
app.use('/notifications', notificationRoutes)


// ── 404 handler ───────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ── Global error handler ──────────────────────────────────────────
app.use(errorHandler)

export default app
