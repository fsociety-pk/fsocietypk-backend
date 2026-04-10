/**
 * Custom operational error class.
 * These errors are safe to send to the client (isOperational = true).
 * Non-operational errors (programming bugs) are caught globally
 * and return a generic 500 response.
 */
export class ApiError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly errors?: unknown[]

  constructor(
    statusCode: number,
    message: string,
    errors?: unknown[],
    isOperational = true,
  ) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.errors = errors
    Object.setPrototypeOf(this, ApiError.prototype)
    Error.captureStackTrace(this, this.constructor)
  }

  // ── Convenience factory methods ───────────────────────────────
  static badRequest(message = 'Bad Request', errors?: unknown[]) {
    return new ApiError(400, message, errors)
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message)
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message)
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message)
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message)
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message)
  }

  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, undefined, false)
  }
}
