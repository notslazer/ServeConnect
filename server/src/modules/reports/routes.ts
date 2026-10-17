/* User reports of profiles, events, posts, messages and safety concerns (REQ-TRUST-5, SRS §5.2). */
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../../db/pool';
import { parse } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { writeLimiter } from '../../middleware/rateLimit';
import { notify } from '../../lib/notify';

const r = Router();

export const REPORT_REASONS = ['spam', 'scam_or_fraud', 'harassment', 'hate_speech', 'inappropriate_content', 'impersonation', 'safety_concern', 'misinformation', 'minor_safety', 'other'] as const;

r.post('/', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(
    z.object({
      targetType: z.enum(['user', 'event', 'post', 'comment', 'discussion', 'message', 'blood_request', 'resource_request', 'safety']),
      targetId: z.string().uuid(),
      reason: z.enum(REPORT_REASONS),
      details: z.string().trim().max(2000).optional(),
    }),
    req.body,
  );
  const dup = await q(`SELECT 1 FROM reports WHERE reporter_id=$1 AND target_type=$2 AND target_id=$3 AND status='open'`, [req.user!.id, b.targetType, b.targetId]);
  if (!dup.length) {
    await q('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1,$2,$3,$4,$5)', [req.user!.id, b.targetType, b.targetId, b.reason, b.details ?? null]);
    const urgent = ['safety_concern', 'minor_safety'].includes(b.reason) || b.targetType === 'safety';
    const admins = (await q(`SELECT id FROM users WHERE role='admin' AND account_status='active'`)).map((x) => x.id);
    await notify(admins, { type: 'report', category: 'system', priority: urgent ? 'high' : 'normal', title: `${urgent ? '⚠️ Safety report' : 'New report'}: ${b.reason.replace(/_/g, ' ')}`, link: '/admin/reports' });
  }
  res.status(201).json({ ok: true, message: 'Thanks — our moderation team will review this report.' });
});

export default r;
