import mongoose, { Schema, Document } from 'mongoose';
import { IAdminProfile } from '../types';

export interface IAdminProfileDocument extends IAdminProfile, Document {}

const adminProfileSchema = new Schema<IAdminProfileDocument>(
  {
    slug: {
      type: String,
      default: 'main',
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Admin name is required'],
      trim: true,
    },
    bio: {
      type: String,
      required: [true, 'Bio is required'],
    },
    profileImage: {
      type: String,
      default: '',
    },
    links: {
      github: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      portfolio: { type: String, default: '' },
    },
    socialLinks: [
      {
        platform: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'admin_profiles',
  }
);

export const AdminProfile = mongoose.model<IAdminProfileDocument>('AdminProfile', adminProfileSchema);
