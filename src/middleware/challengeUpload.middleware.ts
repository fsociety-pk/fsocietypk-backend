import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { promises as fs } from 'fs'
import { extname } from 'path'
import { ApiError } from '../utils/ApiError'
import logger from '../utils/logger'

export const MAX_CHALLENGE_FILES = 5
export const MAX_CHALLENGE_FILE_SIZE = 50 * 1024 * 1024
export const ALLOWED_CHALLENGE_EXTENSIONS = ['.zip', '.7z', '.tar', '.gz', '.tgz']

const upload = multer({
  storage: multer.diskStorage({
    destination: tmpdir(),
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: {
    fileSize: MAX_CHALLENGE_FILE_SIZE,
    files: MAX_CHALLENGE_FILES,
    fields: 10,
    fieldSize: 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase()
    if (!ALLOWED_CHALLENGE_EXTENSIONS.includes(extension)) {
      callback(ApiError.badRequest('Only .zip, .7z, .tar, .gz, and .tgz files are allowed'))
      return
    }
    callback(null, true)
  },
})

export const uploadChallengeAttachments = (req: Request, res: Response, next: NextFunction): void => {
  upload.array('attachments', MAX_CHALLENGE_FILES)(req, res, (error: unknown) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(ApiError.badRequest('Each attachment must be 50 MB or smaller'))
          return
        }
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
          next(ApiError.badRequest('You can upload at most 5 attachments'))
          return
        }
      }
      next(error)
      return
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : []
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= Promise.all(
        uploadedFiles.map(async (file) => {
          try {
            await fs.unlink(file.path)
          } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
              logger.error('Failed to remove temporary challenge attachment.')
            }
          }
        }),
      ).then(() => undefined)
    }

    req.once('aborted', cleanup)
    res.once('finish', cleanup)
    res.once('close', cleanup)
    next()
  })
}
