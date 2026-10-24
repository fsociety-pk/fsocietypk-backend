import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'
import { isOriginAllowed } from '../utils/cors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Reject unsafe browser requests from origins that are not explicitly trusted. */
export const verifyRequestOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  const origin = req.get('origin')
  const referer = req.get('referer')

  // Non-browser clients commonly omit both headers. If either is present,
  // require it to identify one of the configured frontend origins.
  if (origin && !isOriginAllowed(origin)) {
    next(ApiError.forbidden('Request origin is not allowed'))
    return
  }

  if (!origin && referer) {
    try {
      if (!isOriginAllowed(new URL(referer).origin)) {
        next(ApiError.forbidden('Request origin is not allowed'))
        return
      }
    } catch {
      next(ApiError.forbidden('Request origin is not allowed'))
      return
    }
  }

  next()
}
