import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { registerSchema, loginSchema } from '../validators/auth.validator';

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

  const cookieOptions = {
    expires: new Date(Date.now() + env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
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
export const register = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate input
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid registration data', result.error.errors);
  }

  const { username, email, password } = result.data;

  // 2. Check if user already exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw ApiError.conflict('User with this email or username already exists');
  }

  // 3. Create user
  const user = await User.create({
    username,
    email,
    password,
  });

  // 4. Send response
  sendTokenResponse(user, 201, res, 'User registered successfully');
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate input
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.badRequest('Invalid login data', result.error.errors);
  }

  const { email, password } = result.data;

  // 2. Find user & include password for comparison
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.isBanned) {
    throw ApiError.forbidden('Your account has been banned. Access denied.');
  }

  // 3. Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // 4. Send response
  sendTokenResponse(user, 200, res, 'Login successful');
});

/**
 * @desc    Logout user / Clear cookie
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.cookie('jwt', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
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
