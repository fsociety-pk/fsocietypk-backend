import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createReadStream } from 'fs'
import { env } from '../config/env'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export const verifyR2Connection = async (): Promise<
  { reachable: true } | { reachable: false; errorCode?: string; httpStatus?: number }
> => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET }))
    return { reachable: true }
  } catch (error) {
    const r2Error = error as {
      name?: unknown
      Code?: unknown
      $metadata?: { httpStatusCode?: unknown }
    }
    const rawCode = typeof r2Error.Code === 'string'
      ? r2Error.Code
      : typeof r2Error.name === 'string'
        ? r2Error.name
        : undefined

    return {
      reachable: false,
      ...(rawCode && /^[A-Za-z0-9_-]+$/.test(rawCode) && { errorCode: rawCode }),
      ...(typeof r2Error.$metadata?.httpStatusCode === 'number' && {
        httpStatus: r2Error.$metadata.httpStatusCode,
      }),
    }
  }
}

export const uploadToR2 = async (
  fileKey: string,
  filePath: string,
  contentType: string,
  size: number,
): Promise<void> => {
  await s3.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: fileKey,
    Body: createReadStream(filePath),
    ContentLength: size,
    ContentType: contentType,
  }))
}

export const getSignedDownloadUrl = async (
  fileKey: string,
  originalName: string,
  contentType: string,
): Promise<string> => {
  const safeName = originalName.replace(/[\r\n"]/g, '_')
  const fallbackName = safeName.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 180) || 'download'
  const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: fileKey,
    ResponseContentDisposition: `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    ResponseContentType: contentType,
  })

  return getSignedUrl(s3, command, { expiresIn: 5 * 60 })
}

export const deleteFromR2 = async (fileKey: string): Promise<void> => {
  await s3.send(new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: fileKey,
  }))
}
