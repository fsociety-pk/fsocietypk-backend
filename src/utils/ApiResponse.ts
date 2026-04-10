/**
 * Standard API success response wrapper.
 * All successful responses follow this shape:
 * { success: true, statusCode, message, data, meta? }
 */
export class ApiResponse<T = unknown> {
  public readonly success: boolean
  public readonly statusCode: number
  public readonly message: string
  public readonly data: T
  public readonly meta?: Record<string, unknown>

  constructor(
    statusCode: number,
    message: string,
    data: T,
    meta?: Record<string, unknown>,
  ) {
    this.success = statusCode < 400
    this.statusCode = statusCode
    this.message = message
    this.data = data
    this.meta = meta
  }

  // ── Convenience factory methods ───────────────────────────────
  static ok<T>(message: string, data: T, meta?: Record<string, unknown>) {
    return new ApiResponse(200, message, data, meta)
  }

  static created<T>(message: string, data: T) {
    return new ApiResponse(201, message, data)
  }

  static noContent() {
    return new ApiResponse(204, 'No Content', null)
  }

  // ── Pagination helper ─────────────────────────────────────────
  static paginated<T>(
    message: string,
    data: T[],
    page: number,
    limit: number,
    total: number,
  ) {
    return new ApiResponse(200, message, data, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    })
  }
}
