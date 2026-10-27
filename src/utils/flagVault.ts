import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { env } from '../config/env';

export interface VisibleFlag { sequence: number; value: string }
// Domain-separated key; keep FLAG_ENCRYPTION_SECRET stable when rotating JWT secrets.
const key = () => Buffer.from(hkdfSync('sha256', env.FLAG_ENCRYPTION_SECRET || env.JWT_SECRET, 'fsocietypk', 'challenge-flag-vault-v1', 32));
export function encryptFlags(flags: VisibleFlag[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flags), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}
export function decryptFlags(payload: string): VisibleFlag[] {
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid flag vault');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
