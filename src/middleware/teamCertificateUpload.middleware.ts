import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { extname } from 'path';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';

export const MAX_TEAM_CERTIFICATE_SIZE = 8 * 1024 * 1024;
const allowed = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const upload = multer({
  storage: multer.diskStorage({ destination: tmpdir(), filename: (_req, _file, callback) => callback(null, `team-${randomUUID()}`) }),
  limits: { fileSize: MAX_TEAM_CERTIFICATE_SIZE, files: 1, fields: 1, fieldSize: 12000 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(extname(file.originalname).toLowerCase())) return callback(ApiError.badRequest('Choose a PDF, PNG, JPG or WebP certificate'));
    callback(null, true);
  },
});
export const uploadTeamCertificate = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('certificate')(req, res, error => {
    if (error) {
      next(error instanceof multer.MulterError ? ApiError.badRequest(error.code === 'LIMIT_FILE_SIZE' ? 'Certificate must be 8 MB or smaller' : 'Upload one certificate and its details') : error);
      return;
    }
    let cleanup: Promise<unknown> | undefined;
    const clear = () => {
      if (req.file) cleanup ??= fs.unlink(req.file.path).catch(err => { if (err.code !== 'ENOENT') logger.error('Could not remove temporary team certificate'); });
    };
    req.once('aborted', clear); res.once('finish', clear); res.once('close', clear);
    next();
  });
};

/** Inspect bytes and extension; client-provided MIME types are not authoritative. */
export async function inspectTeamCertificate(file: Express.Multer.File): Promise<{ contentType: string; extension: string }> {
  const handle = await fs.open(file.path, 'r');
  const header = Buffer.alloc(12);
  try { await handle.read(header, 0, 12, 0); } finally { await handle.close(); }
  const extension = extname(file.originalname).toLowerCase();
  if (extension === '.pdf' && header.subarray(0, 5).toString() === '%PDF-') return { contentType: 'application/pdf', extension: '.pdf' };
  if (extension === '.png' && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { contentType: 'image/png', extension: '.png' };
  if (['.jpg', '.jpeg'].includes(extension) && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { contentType: 'image/jpeg', extension: '.jpg' };
  if (extension === '.webp' && header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP') return { contentType: 'image/webp', extension: '.webp' };
  throw ApiError.badRequest('The certificate contents do not match its PDF or image file type');
}
