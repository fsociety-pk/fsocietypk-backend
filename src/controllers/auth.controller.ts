import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, randomInt } from 'crypto';
import { PendingRegistration } from '../models/PendingRegistration';
import { sendVerificationEmail } from '../utils/emailHelper';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { registerSchema, loginSchema, verifyEmailSchema, resendOtpSchema } from '../validators/auth.validator';

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Generates a JWT token and sets it in an HTTP-only cookie.
 */
const cookieOptionsForResponse = () => {
  const secureCookie = env.JWT_COOKIE_SECURE ?? env.NODE_ENV === 'production';

  return {
    path: '/',
    expires: new Date(Date.now() + env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: secureCookie,
    sameSite: env.JWT_COOKIE_SAME_SITE,
  } as const;
};

const sendTokenResponse = (user: any, statusCode: number, res: Response, message: string) => {
  const token = jwt.sign(
    { userId: user._id, role: user.role, sessionVersion: user.sessionVersion ?? 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any, algorithm: 'HS256' }
  );

  const cookieOptions = cookieOptionsForResponse();

  // Remove password from output
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  delete userObj.email;
  delete userObj.emailVerifiedAt;
  delete userObj.sessionVersion;
  delete userObj.passwordChangedAt;

  res
    .status(statusCode)
    .cookie('jwt', token, cookieOptions)
    .json(ApiResponse.ok(message, { user: userObj }));
};

// ── Controllers ───────────────────────────────────────────────────

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const OTP_LIFETIME = 10 * 60 * 1000;
const OTP_COOLDOWN = 60 * 1000;
const codeDigest = (id: string, code: string) => createHmac('sha256', env.JWT_SECRET).update(`${id}:${code}`).digest('hex');
const makeCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) throw ApiError.badRequest('Check your email, username and password.', result.error.issues);
  const { email, username, password } = result.data;
  if (await User.exists({ $or: [{ username }, { email }] })) {
    throw ApiError.conflict('That username or email is already registered. Try logging in.');
  }
  const now = new Date();
  const registrationId = randomBytes(32).toString('hex');
  const code = makeCode();
  const pending = await PendingRegistration.findOneAndUpdate({
    email,
    $or: [{ lastSentAt: { $lte: new Date(now.getTime() - OTP_COOLDOWN) } }, { expiresAt: { $lte: now } }],
  }, { $set: {
    registrationId, email, username, passwordHash: await bcrypt.hash(password, 10),
    codeHash: codeDigest(registrationId, code), attempts: 0, lastSentAt: now,
    expiresAt: new Date(now.getTime() + OTP_LIFETIME),
  } }, { upsert: true, new: true }).catch(error => {
    if (error.code === 11000) throw new ApiError(429, 'Please wait a minute before requesting another code.');
    throw error;
  });
  try {
    await sendVerificationEmail(email, code);
  } catch (error) {
    await PendingRegistration.deleteOne({ registrationId });
    throw new ApiError(503, (error as Error).message);
  }
  res.status(202).json(ApiResponse.ok('Check your email for a verification code.', {
    registrationId: pending.registrationId, expiresIn: 600, retryAfter: 60,
  }));
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Enter the six-digit code from your email.');
  const { registrationId, code } = parsed.data;
  const now = new Date();
  // Claim a correct code atomically: simultaneous requests cannot redeem it twice.
  const pending = await PendingRegistration.findOneAndDelete({
    registrationId, codeHash: codeDigest(registrationId, code),
    expiresAt: { $gt: now }, attempts: { $lt: 5 },
  }).select('+passwordHash');
  if (!pending) {
    await PendingRegistration.updateOne({ registrationId, expiresAt: { $gt: now }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } });
    throw ApiError.badRequest('That code is incorrect, expired or used. After 5 attempts, request a new code.');
  }
  const user = new User({ username: pending.username, email: pending.email, emailVerifiedAt: now, password: pending.passwordHash });
  // Only a server-created bcrypt hash from the pending record may bypass hashing.
  user.$locals.passwordIsHashed = true;
  await user.save();
  sendTokenResponse(user, 201, res, 'Email verified. Welcome to Fsociety PK!');
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Start signup again to request a new code.');
  const { registrationId } = parsed.data;
  const now = new Date();
  const code = makeCode();
  const digest = codeDigest(registrationId, code);
  const pending = await PendingRegistration.findOneAndUpdate({
    registrationId, expiresAt: { $gt: now },
    lastSentAt: { $lte: new Date(now.getTime() - OTP_COOLDOWN) },
  }, { $set: { codeHash: digest, attempts: 0, lastSentAt: now, expiresAt: new Date(now.getTime() + OTP_LIFETIME) } }, { new: false }).select('+codeHash');
  if (!pending) throw new ApiError(429, 'Wait one minute between codes. If your registration expired, start signup again.');
  try {
    await sendVerificationEmail(pending.email, code);
  } catch (error) {
    await PendingRegistration.updateOne({ registrationId, codeHash: digest }, { $set: {
      codeHash: pending.codeHash, attempts: pending.attempts, lastSentAt: pending.lastSentAt, expiresAt: pending.expiresAt,
    } });
    throw new ApiError(503, (error as Error).message);
  }
  res.json(ApiResponse.ok('A fresh code is on its way.', { retryAfter: 60, expiresIn: 600 }));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) throw ApiError.badRequest('Enter your username or email and password.', result.error.issues);
  const { username: identity, password } = result.data;
  const user = await User.findOne(identity.includes('@') ? { email: identity } : { username: identity }).select('+password +sessionVersion');
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid username, email or password.');
  if (user.isBanned) throw ApiError.forbidden('Your account has been banned. Access denied.');
  sendTokenResponse(user, 200, res, 'Login successful');
});

/**
 * @desc    Logout user / Clear cookie
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  const secureCookie = env.JWT_COOKIE_SECURE ?? env.NODE_ENV === 'production';

  res.clearCookie('jwt', {
    path: '/',
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
