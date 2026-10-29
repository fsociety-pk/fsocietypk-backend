import { z } from 'zod';

const httpsUrl = z.string().trim().max(2048).url().refine(value => new URL(value).protocol === 'https:', 'Use an HTTPS URL');
const optionalUrl = z.union([httpsUrl, z.literal('')]).default('');
const socialUrl = z.string().trim().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' || (url.protocol === 'mailto:' && z.string().email().safeParse(url.pathname).success); } catch { return false; }
}, 'Use an HTTPS link or a valid mailto email address');
const memberSchema = z.object({
  id: z.string().uuid(), handle: z.string().trim().min(1).max(60),
  name: z.string().trim().max(100).default(''), role: z.string().trim().max(120).default(''),
  bio: z.string().trim().max(2000).default(''), image: optionalUrl,
  specialties: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  links: z.array(z.object({ label: z.string().trim().min(1).max(60), url: httpsUrl }).strict()).max(8).default([]),
}).strict();
export const teamProfileSchema = z.object({
  version: z.number().int().min(0),
  introduction: z.string().trim().min(1).max(1000),
  story: z.array(z.string().trim().min(1).max(3000)).min(1).max(12),
  disciplines: z.array(z.string().trim().min(1).max(80)).max(20),
  members: z.array(memberSchema).max(100).refine(members => new Set(members.map(member => member.id)).size === members.length, 'Member IDs must be unique'),
  socials: z.array(z.object({
    label: z.string().trim().min(1).max(60), detail: z.string().trim().max(150), url: socialUrl,
    kind: z.enum(['discord', 'github', 'linkedin', 'email', 'ctftime', 'website', 'instagram', 'youtube', 'x']),
  }).strict()).max(20),
}).strict();
const eventDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a real event date');
export const teamCertificateSchema = z.object({
  title: z.string().trim().min(1).max(160), eventDate,
  placement: z.string().trim().max(100).default(''),
  description: z.string().trim().max(2000).default(''), eventUrl: optionalUrl,
  isPublished: z.boolean().default(false),
}).strict();
export const teamCertificateUpdateSchema = teamCertificateSchema.extend({ version: z.number().int().min(0) });
export const teamListSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  status: z.enum(['all', 'published', 'draft']).default('all'),
});
