import { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors';

/** Parse input with a zod schema and convert failures into a 400 with per-field messages. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = issue.path.join('.') || '_';
      if (!fields[k]) fields[k] = issue.message;
    }
    const first = Object.values(fields)[0] ?? 'Invalid input';
    throw badRequest(first, { fields });
  }
  return r.data;
}

export const zId = z.string().uuid('Invalid id');
/** Query-string boolean: only "true"/"1" are true (z.coerce.boolean would treat "false" as true). */
export const zBool = z.preprocess((v) => (v === undefined || v === '' ? undefined : v === true || v === 'true' || v === '1'), z.boolean().optional());
export const zPage = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Cursor = "<iso date>|<uuid>" for stable keyset pagination ordered by (created_at desc, id desc). */
export function decodeCursor(c?: string): { at: string; id: string } | null {
  if (!c) return null;
  const [at, id] = Buffer.from(c, 'base64url').toString().split('|');
  if (!at || !id) return null;
  return { at, id };
}
export function encodeCursor(row: { created_at: Date | string; id: string } | undefined): string | null {
  if (!row) return null;
  const at = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return Buffer.from(`${at}|${row.id}`).toString('base64url');
}

export const SKILLS = [
  'medical', 'first_aid', 'nursing', 'counselling', 'teaching', 'tutoring', 'driving', 'logistics',
  'cooking', 'construction', 'photography', 'social_media', 'design', 'tech', 'translation',
  'event_management', 'fundraising', 'legal', 'animal_care', 'elder_care', 'child_care', 'disaster_response',
  'environment', 'sign_language', 'general',
] as const;
export const EVENT_CATEGORIES = [
  'volunteering', 'donation_camp', 'blood_camp', 'disaster_relief', 'cleanup', 'education', 'health',
  'environment', 'animal_welfare', 'elder_care', 'fundraiser', 'awareness', 'other',
] as const;
export const RESOURCE_CATEGORIES = ['food', 'clothing', 'medical', 'education', 'shelter', 'hygiene', 'disaster_relief', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Bombay (hh)'] as const;
