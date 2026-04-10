import { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger'
import { env } from '../config/env'

/**
 * Global error handling middleware.
 * Must be registered LAST in app.ts after all routes.
 */
export const errorHandler = (
  err: Error & { statusCode?: number; isOperational?: boolean; errors?: unknown[] },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode = err.statusCode ?? 500
  let message = err.message ?? 'Internal Server Error'
  let errors = err.errors

  // ── Handle known Mongoose errors ──────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation failed'
  }

  if (err.name === 'CastError') {
    statusCode = 400
    message = 'Invalid resource ID'
  }

  // Duplicate key error (e.g. unique email/username)
  if ((err as NodeJS.ErrnoException).code === '11000') {
    statusCode = 409
    const field = Object.keys((err as any).keyValue ?? {})
    message = `Duplicate field: ${field.join(', ')} already exists`
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401
    message = 'Invalid token'
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Token expired. Please log in again'
  }

  // Log non-operational (unexpected) errors more prominently
  if (!err.isOperational) {
    logger.error(`[UNHANDLED] ${err.message}`, { stack: err.stack })
  } else {
    logger.warn(`[${statusCode}] ${message}`)
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(errors && { errors }),
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}
