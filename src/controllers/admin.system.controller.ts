import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { cpus, freemem, hostname, loadavg, platform, totalmem, uptime } from 'os';
import { statfs } from 'fs/promises';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { EmailJob } from '../models/EmailJob';
import { User } from '../models/User';
import { emailIsConfigured } from '../utils/emailHelper';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
const timed = async <T>(work: Promise<T>, milliseconds: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Status timeout')), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
};
export const getSystemStatus = asyncHandler(async (_req: Request, res: Response) => {
  const started = Date.now();
  let database: { connected: boolean; latencyMs: number | null } = { connected: false, latencyMs: null };
  let queue: Record<string, number> | null = null;
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    try {
      await timed(mongoose.connection.db.command({ ping: 1, maxTimeMS: 2000 }), 2500);
      database = { connected: true, latencyMs: Date.now() - started };
    } catch { /* An unavailable dependency is a status result, not a false healthy response. */ }
  }
  if (database.connected) {
    try {
      const rows = await timed(EmailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: 2000 }), 2500);
      queue = Object.fromEntries(rows.map(row => [row._id, row.count]));
    } catch { /* Queue availability is reported separately from database connectivity. */ }
  }
  let disk: { totalBytes: number; availableBytes: number; usedPercent: number } | null = null;
  try { const fs = await statfs(process.cwd()); const total = fs.blocks * fs.bsize; const available = fs.bavail * fs.bsize; disk = { totalBytes: total, availableBytes: available, usedPercent: total ? (total - available) / total * 100 : 0 }; } catch { /* Some hosts do not expose filesystem capacity. */ }
  const memory = process.memoryUsage();
  res.json(ApiResponse.ok('Backend status retrieved', {
    checkedAt: new Date().toISOString(), status: database.connected ? 'online' : 'degraded',
    backend: { environment: env.NODE_ENV, nodeVersion: process.version, processUptimeSeconds: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed },
    host: { hostname: hostname(), platform: platform(), cpuCores: cpus().length, loadAverage: loadavg(), totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(), uptimeSeconds: uptime(), disk },
    database, email: { configured: emailIsConfigured, queue, workerPollSeconds: 15, maxAttempts: 5 },
  }));
});
export const retryEmails = asyncHandler(async (_req: Request, res: Response) => {
  const result = await EmailJob.updateMany({ status: 'failed' }, { $set: { status: 'queued', attempts: 0, nextAttemptAt: new Date() }, $unset: { lastError: 1, leaseToken: 1 } });
  res.json(ApiResponse.ok('Failed emails queued for retry', { retried: result.modifiedCount }));
});
export const testEmail = asyncHandler(async (req: Request, res: Response) => {
  if (!emailIsConfigured) throw ApiError.badRequest('Configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on the backend first');
  const account = await User.findById(req.user!._id).select('+email');
  if (!account?.email) throw ApiError.badRequest('Your account needs a registered email address for a delivery test');
  const key = randomUUID();
  await EmailJob.create({ _id: key, eventKey: `test:${key}`, recipientId: account._id, audience: 'all', subject: 'Fsociety PK backend email test', text: 'Your backend email delivery worker is working.\n\nThis test was requested from the administration backend status page.', status: 'queued', attempts: 0, nextAttemptAt: new Date() });
  res.status(202).json(ApiResponse.ok('A test email was queued for your account', { queued: true }));
});
