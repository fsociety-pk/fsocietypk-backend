import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';

export interface IUserDocument extends Omit<IUser, '_id' | 'createdAt' | 'updatedAt'>, Document {
  password?: string;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    avatar: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxlength: [200, 'Bio cannot exceed 200 characters'],
    },
    country: {
      type: String,
      default: '',
    },
    score: {
      type: Number,
      default: 0,
    },
    solvedChallenges: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Challenge',
      },
    ],
    isBanned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Password Hashing ──────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password!, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// ── Password Comparison ───────────────────────────────────────────
userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password || '');
};

export const User = mongoose.model<IUserDocument>('User', userSchema);
