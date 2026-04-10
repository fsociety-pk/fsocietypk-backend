import winston from 'winston'
import { env } from '../config/env'

const { combine, timestamp, colorize, printf, errors, json } = winston.format

// ── Dev format (human-readable) ───────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) => {
    return `${timestamp}  ${level}  ${stack || message}`
  })
)

// ── Production format (JSON for log aggregators) ──────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
)

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exitOnError: false,
})

export default logger
