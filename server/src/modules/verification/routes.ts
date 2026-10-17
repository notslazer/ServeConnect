/* Verification submissions (REQ-PROF-2): document upload → encrypted storage → admin review queue. */
import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, conflict } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { uploader, checkFiles, DOC_TYPES } from '../../lib/upload';
import { putPrivate } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { audit } from '../admin/audit';

const r = Router();

export const DOC_TYPE_LABELS: Record<string, string> = {
  ngo_registration: 'NGO registration certificate (Trust / Society / Section 8)',
  darpan: 'NGO Darpan ID certificate',
  tax_exemption: '12A / 80G certificate',
  government_id: 'Government photo ID (Aadhaar / PAN / Passport / Voter ID)',
  company_registration: 'Company incorporation / CSR registration',
  medical_license: 'Medical / professional licence',
  other: 'Other supporting document',
};

r.get('/me', requireAuth, async (req, res) => {
  const rows = await q(
    `SELECT id, doc_type, note, status, reason, created_at, reviewed_at, jsonb_array_length(documents) AS document_count
       FROM verification_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`,
    [req.user!.id],
  );
  const u = await one('SELECT verification_status, verified_at FROM users WHERE id=$1', [req.user!.id]);
  res.json({ ...camel({ status: u.verification_status, verifiedAt: u.verified_at, history: rows }), docTypes: DOC_TYPE_LABELS });
});

r.post('/', requireAuth, uploader({ maxMb: 10, maxFiles: 5, field: 'files' }), async (req, res) => {
  const b = parse(z.object({ docType: z.enum(Object.keys(DOC_TYPE_LABELS) as [string, ...string[]]), note: z.string().trim().max(1000).optional() }), req.body);
  const u = await one('SELECT verification_status FROM users WHERE id=$1', [req.user!.id]);
  if (u.verification_status === 'verified') throw conflict('Your profile is already verified.');
  if (u.verification_status === 'pending') throw conflict('You already have a submission under review.');
  const files = await checkFiles(req.files as Express.Multer.File[], DOC_TYPES);
  if (!files.length) throw badRequest('Upload at least one document (PDF or image).');
  const docs: { key: string; name: string; mime: string; size: number }[] = [];
  for (const f of files) {
    const s = await putPrivate(f.buffer, 'verification');
    docs.push({ key: s.key, name: f.name, mime: f.mime, size: f.size });
  }
  const vr = await one('INSERT INTO verification_requests (user_id, doc_type, documents, note) VALUES ($1,$2,$3,$4) RETURNING id', [req.user!.id, b.docType, JSON.stringify(docs), b.note ?? null]);
  await q(`UPDATE users SET verification_status='pending' WHERE id=$1`, [req.user!.id]);
  const admins = (await q(`SELECT id FROM users WHERE role='admin' AND account_status='active'`)).map((x) => x.id);
  await notify(admins, { type: 'verification_submitted', category: 'system', title: `New verification request from ${req.user!.name}`, link: '/admin/verifications' });
  audit(req.user!.id, 'verification.submitted', 'verification', vr!.id);
  res.status(201).json({ id: vr!.id, status: 'pending' });
});

export default r;
