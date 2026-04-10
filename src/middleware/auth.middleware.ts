import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { ApiError } from '../utils/ApiError'
import { env } from '../config/env'
import { User } from '../models/User'

export interface JwtPayload {
  userId: string
  role: 'user' | 'admin'
  iat: number
  exp: number
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string
        role: 'user' | 'admin'
      }
    }
  }
}

/**
 * Verifies JWT from HTTP-only cookie or Authorization header.
 * Attaches req.user on success.
 */
export const protect = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // 1. Extract token
    let token: string | undefined

    if (req.cookies?.jwt) {
      token = req.cookies.jwt
    } else if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (!token) {
      return next(ApiError.unauthorized('Not authenticated. Please log in.'))
    }

    // 2. Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload

    // 3. Check user still exists in DB and is not banned
    const user = await User.findById(decoded.userId).select('role isBanned')
    if (!user) {
      return next(ApiError.unauthorized('User belonging to this token no longer exists'))
    }

    if (user.isBanned) {
      return next(ApiError.forbidden('Your account has been banned. Access denied.'))
    }

    // 4. Attach to request
    req.user = { _id: user._id.toString(), role: user.role }

    next()
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Invalid token. Please log in again.'))
    }
    if (error.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Your token has expired. Please log in again.'))
    }
    next(error)
  }
}


/**
 * Restricts access to specified roles.
 * Must be used AFTER `protect`.
 */
export const restrictTo = (...roles: Array<'user' | 'admin'>) =>
  (_req: Request, __res: Response, next: NextFunction): void => {
    if (!_req.user || !roles.includes(_req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'))
    }
    next()
  }
