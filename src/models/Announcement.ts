import type { Role } from '../utils/roles';
import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  adminId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  targetRole?: 'all' | 'staff' | Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    targetRole: {
      type: String,
      enum: ['all', 'staff', 'user', 'admin', 'manager', 'moderator', 'editor', 'analyst'],
      default: 'all',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema);
