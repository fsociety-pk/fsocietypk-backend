import mongoose, { Schema } from 'mongoose';

// No account or session exists until this short-lived registration is verified.
const pendingRegistrationSchema = new Schema({
  registrationId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
export const PendingRegistration = mongoose.model('PendingRegistration', pendingRegistrationSchema);
