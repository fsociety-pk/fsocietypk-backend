import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { TeamProfile, defaultTeamProfile } from '../models/TeamProfile';
import { TeamCertificate } from '../models/TeamCertificate';
import { teamProfileSchema, teamCertificateSchema, teamCertificateUpdateSchema, teamListSchema } from '../schemas/team.schema';
import { adminIdSchema } from '../schemas/admin.schema';
import { inspectTeamCertificate } from '../middleware/teamCertificateUpload.middleware';
import { uploadToR2, deleteFromR2, getSignedDownloadUrl } from '../lib/r2';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';

type StoredProfile = Omit<z.infer<typeof teamProfileSchema>, 'version'> & { __v?: number };
interface StoredCertificate {
  _id: { toString(): string }; __v?: number; title: string; eventDate: string;
  placement: string; description: string; eventUrl: string; isPublished: boolean;
  file: { fileKey: string; originalName: string; contentType: string; size: number };
}
const profileJson = (record: unknown, admin: boolean) => {
  const profile = (record || defaultTeamProfile) as StoredProfile;
  return { introduction: profile.introduction, story: profile.story, disciplines: profile.disciplines, members: profile.members, socials: profile.socials, ...(admin && { version: profile.__v ?? 0 }) };
};
const certificateJson = (record: unknown, admin: boolean) => {
  const item = record as StoredCertificate;
  return { id: item._id.toString(), title: item.title, eventDate: item.eventDate, placement: item.placement, description: item.description, eventUrl: item.eventUrl,
    certificate: { name: item.file.originalName, contentType: item.file.contentType, size: item.file.size },
    ...(admin && { isPublished: item.isPublished, version: item.__v ?? 0 }),
  };
};
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Check the team details and try again.', result.error.issues);
  return result.data;
};
const certificateId = (req: Request) => parse(adminIdSchema, req.params.id);
const multipartData = (req: Request): unknown => {
  try { return JSON.parse(req.body?.data); } catch { throw ApiError.badRequest('Certificate details must be valid JSON in the data field'); }
};
const removeR2File = async (key: string): Promise<void> => {
  try { await deleteFromR2(key); }
  catch { logger.error('Team certificate R2 cleanup failed', { fileKey: key }); }
};
const storeUpload = async (file: Express.Multer.File) => {
  const { contentType, extension } = await inspectTeamCertificate(file);
  const fileKey = `team/certificates/${randomUUID()}${extension}`;
  try { await uploadToR2(fileKey, file.path, contentType, file.size); }
  catch { await removeR2File(fileKey); throw new ApiError(503, 'Certificate storage is unavailable. Please try again.'); }
  return { fileKey, originalName: file.originalname.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180), contentType, size: file.size };
};

export const getTeamProfile = (admin = false) => asyncHandler(async (_req: Request, res: Response) => {
  const profile = await TeamProfile.findOne({ slug: 'main' }).lean();
  res.setHeader('Cache-Control', 'no-store');
  res.json(ApiResponse.ok('Team details retrieved', profileJson(profile, admin)));
});
export const updateTeamProfile = asyncHandler(async (req: Request, res: Response) => {
  const { version, ...data } = parse(teamProfileSchema, req.body);
  const existing = await TeamProfile.findOne({ slug: 'main' }).lean();
  let saved;
  if (!existing) {
    if (version !== 0) throw ApiError.conflict('Team details changed. Refresh before saving.');
    try { saved = await TeamProfile.create({ slug: 'main', ...data }); }
    catch (error) { if ((error as { code?: number }).code === 11000) throw ApiError.conflict('Team details changed. Refresh before saving.'); throw error; }
  } else {
    saved = await TeamProfile.findOneAndUpdate({ slug: 'main', __v: version }, { $set: data, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!saved) throw ApiError.conflict('Team details changed. Refresh before saving.');
  }
  res.json(ApiResponse.ok('Team details saved', profileJson(saved.toObject(), true)));
});

export const listTeamCertificates = (admin = false) => asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, year, status } = parse(teamListSchema, req.query);
  const visibility = admin ? (status === 'all' ? {} : { isPublished: status === 'published' }) : { isPublished: true };
  const filter = { ...visibility, ...(year && { eventYear: year }) };
  const [items, total, years] = await Promise.all([
    TeamCertificate.find(filter).sort({ eventDate: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    TeamCertificate.countDocuments(filter), TeamCertificate.distinct('eventYear', visibility),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json(ApiResponse.ok('Team certificates retrieved', { certificates: items.map(item => certificateJson(item, admin)), years: years.filter((value): value is number => typeof value === 'number' && Number.isInteger(value)).sort((a, b) => b - a), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }));
});

export const createTeamCertificate = asyncHandler(async (req: Request, res: Response) => {
  const data = parse(teamCertificateSchema, multipartData(req));
  if (!req.file) throw ApiError.badRequest('Choose a certificate file');
  const file = await storeUpload(req.file);
  let record;
  try { record = await TeamCertificate.create({ ...data, eventYear: data.eventDate ? Number(data.eventDate.slice(0, 4)) : null, file }); }
  catch (error) { await removeR2File(file.fileKey); throw error; }
  res.status(201).json(ApiResponse.created('Certificate saved', certificateJson(record.toObject(), true)));
});
export const updateTeamCertificate = asyncHandler(async (req: Request, res: Response) => {
  const id = certificateId(req);
  const { version, ...data } = parse(teamCertificateUpdateSchema, multipartData(req));
  const previous = await TeamCertificate.findById(id).lean();
  if (!previous) throw ApiError.notFound('Certificate not found');
  if (previous.__v !== version) throw ApiError.conflict('This certificate changed. Refresh before saving.');
  const replacement = req.file ? await storeUpload(req.file) : undefined;
  let record;
  try {
    record = await TeamCertificate.findOneAndUpdate({ _id: id, __v: version }, { $set: { ...data, eventYear: data.eventDate ? Number(data.eventDate.slice(0, 4)) : null, ...(replacement && { file: replacement }) }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!record) throw ApiError.conflict('This certificate changed. Refresh before saving.');
  } catch (error) { if (replacement) await removeR2File(replacement.fileKey); throw error; }
  if (replacement) await removeR2File(previous.file.fileKey);
  res.json(ApiResponse.ok('Certificate updated', certificateJson(record.toObject(), true)));
});
export const deleteTeamCertificate = asyncHandler(async (req: Request, res: Response) => {
  const id = certificateId(req);
  const { version } = parse(z.object({ version: z.coerce.number().int().min(0) }), req.query);
  const record = await TeamCertificate.findOneAndDelete({ _id: id, __v: version });
  if (!record) throw ApiError.conflict('This certificate changed or was removed. Refresh the list.');
  await removeR2File(record.file.fileKey);
  res.json(ApiResponse.ok('Certificate deleted', null));
});
export const getTeamCertificateFile = (admin = false) => asyncHandler(async (req: Request, res: Response) => {
  const id = certificateId(req);
  const record = await TeamCertificate.findOne({ _id: id, ...(!admin && { isPublished: true }) }).lean();
  if (!record) throw ApiError.notFound('Certificate not found');
  const url = await getSignedDownloadUrl(record.file.fileKey, record.file.originalName, record.file.contentType, req.query.download === '1' ? 'attachment' : 'inline');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', admin ? 'same-site' : 'cross-origin');
  res.redirect(302, url);
});
