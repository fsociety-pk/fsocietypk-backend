import { Schema, model } from 'mongoose';
const messageSchema = new Schema({
  author: { type: String, enum: ['member', 'admin'], required: true },
  body: { type: String, required: true, maxlength: 5000 },
}, { timestamps: true });
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true, maxlength: 140 },
  category: { type: String, enum: ['technical', 'account', 'challenge', 'feedback', 'other'], required: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', required: true },
  messages: { type: [messageSchema], required: true },
  emailStatus: { type: String, enum: ['queued', 'sending', 'sent', 'failed'], default: 'queued', select: false },
  emailAttempts: { type: Number, default: 0, select: false },
  emailNextAttemptAt: { type: Date, default: Date.now, select: false },
  emailLease: { type: String, select: false },
}, { timestamps: true });
schema.index({ status: 1, updatedAt: -1 });
schema.index({ emailStatus: 1, emailNextAttemptAt: 1 });
export const SupportTicket = model('SupportTicket', schema);
