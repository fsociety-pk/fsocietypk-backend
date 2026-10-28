import { z } from 'zod';
import { SupportTicket } from '../models/SupportTicket';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

const body = z.string().trim().min(10).max(5000);
export const ticketSchema = z.object({ subject: z.string().trim().min(5).max(140), category: z.enum(['technical', 'account', 'challenge', 'feedback', 'other']), message: body });
const updateSchema = z.object({ message: z.string().trim().min(1).max(5000).optional(), status: z.enum(['open', 'in_progress', 'resolved']).optional() }).refine(value => value.message || value.status, 'Write a reply or choose a status');
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.badRequest(result.error.issues[0].message);
  return result.data;
};
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const scope = (req: Express.Request, admin: boolean) => admin ? {} : { userId: req.user!._id };
const populate = { path: 'userId', select: 'username' };
export const createTicket = asyncHandler(async (req, res) => {
  const input = parse(ticketSchema, req.body);
  const ticket = await SupportTicket.create({ userId: req.user!._id, subject: input.subject, category: input.category, messages: [{ author: 'member', body: input.message }] });
  const { emailStatus, emailAttempts, emailNextAttemptAt, emailLease, ...publicTicket } = ticket.toObject();
  res.status(201).json(ApiResponse.created('Your ticket has been sent to the admin.', publicTicket));
});
export const listTickets = (admin = false) => asyncHandler(async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
  const status = req.query.status === undefined || req.query.status === 'all' ? undefined : parse(z.enum(['open', 'in_progress', 'resolved']), req.query.status);
  const filter = { ...scope(req, admin), ...(status ? { status } : {}) };
  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter).select('-messages').populate(populate).sort({ updatedAt: -1 }).skip((Math.floor(page) - 1) * 20).limit(20),
    SupportTicket.countDocuments(filter),
  ]);
  res.json(ApiResponse.paginated('Support tickets', tickets, Math.floor(page), 20, total));
});
export const getTicket = (admin = false) => asyncHandler(async (req, res) => {
  parse(id, req.params.id);
  const ticket = await SupportTicket.findOne({ _id: req.params.id, ...scope(req, admin) }).populate(populate);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json(ApiResponse.ok('Support ticket', ticket));
});
export const updateTicket = (admin = false) => asyncHandler(async (req, res) => {
  parse(id, req.params.id);
  const input = parse(updateSchema, req.body);
  if (!admin && input.status) throw ApiError.forbidden('Only the admin can change ticket status');
  const filter = { _id: req.params.id, ...scope(req, admin), ...(!admin ? { status: { $ne: 'resolved' } } : {}), ...(input.message ? { 'messages.199': { $exists: false } } : {}) };
  const ticket = await SupportTicket.findOneAndUpdate(filter, {
    ...(input.message ? { $push: { messages: { author: admin ? 'admin' : 'member', body: input.message } } } : {}),
    ...(input.status ? { $set: { status: input.status } } : {}),
  }, { new: true, runValidators: true }).populate(populate);
  if (!ticket) throw ApiError.conflict('Ticket unavailable, resolved, or at its reply limit. Refresh and try again.');
  res.json(ApiResponse.ok('Ticket updated', ticket));
});
