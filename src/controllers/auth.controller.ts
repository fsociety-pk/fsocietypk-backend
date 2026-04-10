import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { checkForSQLInjection, getSQLInjectionResponse } from '../utils/sqlInjectionDetector';

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Generates a JWT token and sets it in an HTTP-only cookie.
 */
const sendTokenResponse = (user: any, statusCode: number, res: Response, message: string) => {
  const token = jwt.sign(
    { userId: user._id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );

  const secureCookie = env.JWT_COOKIE_SECURE ?? env.NODE_ENV === 'production';

  const cookieOptions = {
    expires: new Date(Date.now() + env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: secureCookie,
    sameSite: env.JWT_COOKIE_SAME_SITE,
  };

  // Remove password from output
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;

  res
    .status(statusCode)
    .cookie('jwt', token, cookieOptions)
    .json(ApiResponse.ok(message, { user: userObj, token }));
};

// ── Controllers ───────────────────────────────────────────────────

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // 1. Validate input
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid registration data', result.error.errors);
  }

  const { username, password } = result.data;

  // 2. Check for SQL injection attempts
  const sqlInjectionCheck = checkForSQLInjection({ username, password });
  if (sqlInjectionCheck.detected) {
    const injectionResponse = getSQLInjectionResponse();
    res.status(injectionResponse.statusCode).json(
      new ApiResponse(
        injectionResponse.statusCode,
        injectionResponse.message,
        { 
          isSQLInjection: true,
          attemptedField: sqlInjectionCheck.field 
        }
      )
    );
    return;
  }

  // 3. Check if user already exists
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    throw ApiError.conflict('Username already exists');
  }

  // 4. Create user
  const user = await User.create({
    username,
    password,
  });

  // 5. Send response
  sendTokenResponse(user, 201, res, 'User registered successfully');
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // 1. Validate input
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid login data', result.error.errors);
  }

  const { username, password } = result.data;

  // 2. Check for SQL injection attempts
  const sqlInjectionCheck = checkForSQLInjection({ username, password });
  if (sqlInjectionCheck.detected) {
    const injectionResponse = getSQLInjectionResponse();
    res.status(injectionResponse.statusCode).json(
      new ApiResponse(
        injectionResponse.statusCode,
        injectionResponse.message,
        { 
          isSQLInjection: true,
          attemptedField: sqlInjectionCheck.field 
        }
      )
    );
    return;
  }

  // 3. Find user & include password for comparison
  const user = await User.findOne({ username }).select('+password');
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.isBanned) {
    throw ApiError.forbidden('Your account has been banned. Access denied.');
  }

  // 4. Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // 5. Send response
  sendTokenResponse(user, 200, res, 'Login successful');
});

/**
 * @desc    Logout user / Clear cookie
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  const secureCookie = env.JWT_COOKIE_SECURE ?? env.NODE_ENV === 'production';

  res.cookie('jwt', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: secureCookie,
    sameSite: env.JWT_COOKIE_SAME_SITE,
  });

  res.status(200).json(ApiResponse.ok('Logged out successfully', null));
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // req.user is attached by the 'protect' middleware
  const user = await User.findById(req.user!._id);
  
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  res.status(200).json(ApiResponse.ok('User data retrieved', user));
});
