/* Platform administration: verification review queue (REQ-TRUST-1), report moderation (REQ-TRUST-5),
 * user suspension, roles, platform analytics, broadcast announcements and audit log. */
import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { requireAuth, requireRole, ip } from '../../middleware/auth';
import { getPrivate, removeFile } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { audit } from './audit';
import { USER_CARD_SQL } from '../users/serialize';
import { DOC_TYPE_LABELS } from '../verification/routes';

const r = Router();
r.use(requireAuth, requireRole('admin'));

r.get('/stats', async (_req, res) => {
  const s = await one(`
    SELECT (SELECT count(*) FROM users WHERE account_status<>'deleted')::int AS users,
           (SELECT count(*) FROM users WHERE role='volunteer' AND account_status<>'deleted')::int AS volunteers,
           (SELECT count(*) FROM users WHERE role IN ('organizer','csr') AND account_status<>'deleted')::int AS organizers,
           (SELECT count(*) FROM users WHERE verification_status='verified')::int AS verified,
           (SELECT count(*) FROM users WHERE account_status='suspended')::int AS suspended,
           (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days' AND account_status<>'deleted')::int AS new_users_7d,
           (SELECT count(*) FROM users WHERE last_active_at > now() - interval '1 day')::int AS active_24h,
           (SELECT count(*) FROM events WHERE status='published')::int AS live_events,
           (SELECT count(*) FROM events WHERE status='completed')::int AS completed_events,
           (SELECT count(*) FROM event_registrations WHERE status='attended')::int AS checkins,
           (SELECT coalesce(sum(hours),0) FROM event_registrations WHERE status='attended')::float AS hours,
           (SELECT count(*) FROM blood_requests WHERE status='open')::int AS open_blood,
           (SELECT count(*) FROM resource_requests WHERE status='open')::int AS open_resources,
           (SELECT count(*) FROM verification_requests WHERE status='pending')::int AS pending_verifications,
           (SELECT count(*) FROM reports WHERE status='open')::int AS open_reports,
           (SELECT count(*) FROM certificates)::int AS certificates`);
  const signups = await q(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS n FROM users WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`);
  const hours = await q(
    `SELECT to_char(date_trunc('month', e.start_at), 'YYYY-MM') AS month, coalesce(sum(r.hours),0)::float AS hours, count(*)::int AS checkins
       FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.status='attended' AND e.start_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`,
  );
  const categories = await q(`SELECT category, count(*)::int AS n FROM events WHERE status IN ('published','completed') GROUP BY 1 ORDER BY n DESC`);
  res.json(camel({ ...s, signups, hours, categories }));
});

// ───────────────────────── verification queue ─────────────────────────
r.get('/verifications', async (req, res) => {
  const status = (req.query.status as string) || 'pending';
  const rows = await q(
    `SELECT v.id, v.doc_type, v.note, v.status, v.reason, v.created_at, v.reviewed_at, v.docs_purged_at,
            (SELECT coalesce(json_agg(json_build_object('name', d->>'name', 'mime', d->>'mime', 'size', d->>'size')), '[]') FROM jsonb_array_elements(v.documents) d) AS documents,
            ${USER_CARD_SQL} AS user, u.email, u.org_type, u.org_registration_no, u.created_at AS user_created_at,
            (SELECT name FROM users rv WHERE rv.id=v.reviewer_id) AS reviewer_name
       FROM verification_requests v JOIN users u ON u.id=v.user_id
      WHERE ($1='all' OR v.status=$1) ORDER BY v.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  res.json(camel(rows.map((x) => ({ ...x, doc_type_label: DOC_TYPE_LABELS[x.doc_type] ?? x.doc_type }))));
});

/** Streams a decrypted verification document to an administrator. Every access is audited. */
r.get('/verifications/:id/documents/:index', async (req, res) => {
  const v = await one('SELECT * FROM verification_requests WHERE id=$1', [req.params.id]);
  if (!v) throw notFound();
  const doc = v.documents[Number(req.params.index)];
  if (!doc || v.docs_purged_at) throw notFound('This document is no longer available (purged after review).');
  const buf = await getPrivate(doc.key);
  audit(req.user!.id, 'verification.document_viewed', 'verification', v.id, { index: req.params.index }, ip(req));
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

r.post('/verifications/:id/decide', async (req, res) => {
  const b = parse(z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(1000).optional() }), req.body);
  if (b.decision === 'rejected' && !b.reason) throw badRequest('Give a reason so the applicant knows what to fix.', { fields: { reason: 'Required when rejecting' } });
  const v = await tx(async (c) => {
    const v = (await c.query('SELECT * FROM verification_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!v) throw notFound();
    if (v.status !== 'pending') throw badRequest('This request has already been decided.');
    await c.query('UPDATE verification_requests SET status=$2, reason=$3, reviewer_id=$4, reviewed_at=now() WHERE id=$1', [v.id, b.decision, b.reason ?? null, req.user!.id]);
    await c.query(
      `UPDATE users SET verification_status=$2, verified_at = CASE WHEN $2='verified' THEN now() ELSE verified_at END WHERE id=$1`,
      [v.user_id, b.decision === 'approved' ? 'verified' : 'rejected'],
    );
    return v;
  });
  audit(req.user!.id, `verification.${b.decision}`, 'user', v.user_id, { requestId: v.id, reason: b.reason }, ip(req));
  await notify([v.user_id], {
    type: 'verification_decision', category: 'system', priority: 'high',
    title: b.decision === 'approved' ? '✅ Your profile is now verified!' : 'Your verification request was not approved',
    body: b.decision === 'approved' ? 'Your Verified badge is live. You can now publish events and requests.' : `Reason: ${b.reason}. You can submit new documents any time.`,
    link: '/settings/verification',
  });
  res.json({ ok: true });
});

/** Directly grant/revoke a badge (e.g. for volunteers verified offline). */
r.post('/users/:id/verification', async (req, res) => {
  const b = parse(z.object({ status: z.enum(['verified', 'unverified']), reason: z.string().max(500).optional() }), req.body);
  await q(`UPDATE users SET verification_status=$2, verified_at = CASE WHEN $2='verified' THEN now() ELSE NULL END WHERE id=$1`, [req.params.id, b.status]);
  audit(req.user!.id, `verification.manual_${b.status}`, 'user', String(req.params.id), { reason: b.reason }, ip(req));
  await notify([String(req.params.id)], { type: 'verification_decision', category: 'system', title: b.status === 'verified' ? '✅ Your profile is now verified!' : 'Your verified badge was removed', body: b.reason, link: '/settings/verification' });
  res.json({ ok: true });
});

// ───────────────────────── reports ─────────────────────────
async function describeTarget(type: string, id: string) {
  switch (type) {
    case 'user': return one(`SELECT name AS title, '/u/' || handle AS link, id AS owner_id FROM users WHERE id=$1`, [id]);
    case 'event': return one(`SELECT title, '/events/' || id AS link, organizer_id AS owner_id FROM events WHERE id=$1`, [id]);
    case 'post': return one(`SELECT left(coalesce(body,'(photo post)'), 140) AS title, '/posts/' || id AS link, author_id AS owner_id, deleted_at FROM posts WHERE id=$1`, [id]);
    case 'comment': return one(`SELECT left(body, 140) AS title, '/posts/' || post_id AS link, author_id AS owner_id, deleted_at FROM post_comments WHERE id=$1`, [id]);
    case 'discussion': return one(`SELECT left(body, 140) AS title, '/events/' || event_id || '?tab=discussion' AS link, author_id AS owner_id, deleted_at FROM discussions WHERE id=$1`, [id]);
    case 'message': return one(`SELECT left(coalesce(body,'(attachment)'), 140) AS title, NULL AS link, sender_id AS owner_id, deleted_at FROM messages WHERE id=$1`, [id]);
    case 'blood_request': return one(`SELECT blood_group || ' at ' || hospital_name AS title, '/requests/blood/' || id AS link, requester_id AS owner_id FROM blood_requests WHERE id=$1`, [id]);
    case 'resource_request': return one(`SELECT title, '/requests/resources/' || id AS link, requester_id AS owner_id FROM resource_requests WHERE id=$1`, [id]);
    case 'safety': return one(`SELECT title, '/events/' || id AS link, organizer_id AS owner_id FROM events WHERE id=$1`, [id]);
    default: return null;
  }
}

r.get('/reports', async (req, res) => {
  const status = (req.query.status as string) || 'open';
  const rows = await q(
    `SELECT rp.*, ${USER_CARD_SQL} AS reporter, (SELECT name FROM users x WHERE x.id=rp.resolver_id) AS resolver_name,
            (SELECT count(*) FROM reports o WHERE o.target_id=rp.target_id)::int AS total_reports_on_target
       FROM reports rp JOIN users u ON u.id=rp.reporter_id
      WHERE ($1='all' OR rp.status=$1) ORDER BY (rp.reason IN ('safety_concern','minor_safety')) DESC, rp.created_at ASC LIMIT 200`,
    [status],
  );
  for (const row of rows) {
    const t = await describeTarget(row.target_type, row.target_id).catch(() => null);
    row.target = t;
    if (t?.owner_id) {
      const o = await one(`SELECT ${USER_CARD_SQL} AS c, u.account_status FROM users u WHERE u.id=$1`, [t.owner_id]);
      row.target_owner = o ? { ...o.c, accountStatus: o.account_status } : null;
    }
  }
  res.json(camel(rows));
});

r.post('/reports/:id/resolve', async (req, res) => {
  const b = parse(
    z.object({
      outcome: z.enum(['actioned', 'dismissed']),
      action: z.enum(['none', 'remove_content', 'suspend_user', 'warn_user', 'cancel_event', 'close_request']).default('none'),
      note: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );
  const rp = await one('SELECT * FROM reports WHERE id=$1', [req.params.id]);
  if (!rp) throw notFound();
  if (rp.status !== 'open') throw badRequest('Already resolved.');
  const target: any = await describeTarget(rp.target_type, rp.target_id);
  if (b.outcome === 'actioned' && target) {
    if (b.action === 'remove_content') {
      const table = { post: 'posts', comment: 'post_comments', discussion: 'discussions', message: 'messages' }[rp.target_type as string];
      if (!table) throw badRequest('This content type cannot be removed; choose another action.');
      await q(`UPDATE ${table} SET deleted_at=now() WHERE id=$1`, [rp.target_id]);
    }
    if (b.action === 'suspend_user' && target.owner_id) {
      await q(`UPDATE users SET account_status='suspended', suspended_reason=$2 WHERE id=$1 AND role<>'admin'`, [target.owner_id, b.note ?? 'Violation of community guidelines']);
      await notify([target.owner_id], { type: 'suspended', category: 'system', priority: 'high', title: 'Your account has been suspended', body: b.note ?? 'Violation of community guidelines.', link: '/settings/account' });
    }
    if (b.action === 'warn_user' && target.owner_id) {
      await notify([target.owner_id], { type: 'warning', category: 'system', priority: 'high', title: 'Warning from the moderation team', body: b.note ?? 'Content you posted was reported and found to violate our guidelines.', link: target.link ?? '/' });
    }
    if (b.action === 'cancel_event' && ['event', 'safety'].includes(rp.target_type)) {
      await q(`UPDATE events SET status='cancelled' WHERE id=$1 AND status IN ('draft','published')`, [rp.target_id]);
    }
    if (b.action === 'close_request') {
      if (rp.target_type === 'blood_request') await q(`UPDATE blood_requests SET status='closed' WHERE id=$1`, [rp.target_id]);
      if (rp.target_type === 'resource_request') await q(`UPDATE resource_requests SET status='closed' WHERE id=$1`, [rp.target_id]);
    }
  }
  // Resolve all open reports on the same target together.
  const resolved = await q(
    `UPDATE reports SET status=$2, action_taken=$3, resolution_note=$4, resolver_id=$5, resolved_at=now()
      WHERE target_type=$6 AND target_id=$1 AND status='open' RETURNING reporter_id`,
    [rp.target_id, b.outcome, b.action, b.note ?? null, req.user!.id, rp.target_type],
  );
  audit(req.user!.id, `report.${b.outcome}`, rp.target_type, rp.target_id, { action: b.action, note: b.note }, ip(req));
  await notify(resolved.map((x) => x.reporter_id), {
    type: 'report_outcome', category: 'system', title: 'Update on your report',
    body: b.outcome === 'actioned' ? 'We reviewed your report and took action. Thank you for helping keep the community safe.' : 'We reviewed your report and found no violation of our guidelines.',
  });
  res.json({ ok: true, resolved: resolved.length });
});

// ───────────────────────── users ─────────────────────────
r.get('/users', async (req, res) => {
  const b = parse(z.object({ q: z.string().optional(), role: z.string().optional(), status: z.string().optional(), offset: z.coerce.number().default(0) }), req.query);
  const vals: any[] = [];
  const where = [`u.account_status <> 'deleted'`];
  if (b.q) { vals.push(`%${b.q.toLowerCase()}%`); where.push(`(lower(u.name) LIKE $${vals.length} OR lower(u.handle::text) LIKE $${vals.length} OR lower(coalesce(u.email::text,'')) LIKE $${vals.length})`); }
  if (b.role) { vals.push(b.role); where.push(`u.role=$${vals.length}`); }
  if (b.status) { vals.push(b.status); where.push(`u.account_status=$${vals.length}`); }
  vals.push(b.offset);
  const rows = await q(
    `SELECT u.id, u.name, u.handle, u.email, u.role, u.account_status, u.verification_status, u.email_verified, u.phone_verified,
            u.two_factor_enabled, u.is_minor, u.guardian_consent, u.created_at, u.last_active_at, u.suspended_reason, u.avatar_url,
            (SELECT count(*) FROM reports rp WHERE rp.target_id=u.id)::int AS reports
       FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 50 OFFSET $${vals.length}`,
    vals,
  );
  res.json(camel(rows));
});

r.post('/users/:id/suspend', async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) }), req.body);
  const u = await one(`UPDATE users SET account_status='suspended', suspended_reason=$2 WHERE id=$1 AND role<>'admin' RETURNING id`, [req.params.id, b.reason]);
  if (!u) throw badRequest('User not found, or is an administrator.');
  audit(req.user!.id, 'user.suspended', 'user', u.id, { reason: b.reason }, ip(req));
  await notify([u.id], { type: 'suspended', category: 'system', priority: 'high', title: 'Your account has been suspended', body: b.reason, link: '/settings/account' });
  res.json({ ok: true });
});
r.post('/users/:id/unsuspend', async (req, res) => {
  await q(`UPDATE users SET account_status='active', suspended_reason=NULL WHERE id=$1 AND account_status='suspended'`, [req.params.id]);
  audit(req.user!.id, 'user.unsuspended', 'user', String(req.params.id), {}, ip(req));
  await notify([String(req.params.id)], { type: 'unsuspended', category: 'system', title: 'Your account has been restored', link: '/' });
  res.json({ ok: true });
});
r.patch('/users/:id/role', async (req, res) => {
  const b = parse(z.object({ role: z.enum(['volunteer', 'organizer', 'csr', 'admin']) }), req.body);
  if (req.params.id === req.user!.id) throw badRequest("You can't change your own role.");
  await q('UPDATE users SET role=$2 WHERE id=$1', [req.params.id, b.role]);
  audit(req.user!.id, 'user.role_changed', 'user', String(req.params.id), { role: b.role }, ip(req));
  res.json({ ok: true });
});
r.post('/users/:id/revoke-sessions', async (req, res) => {
  await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [req.params.id]);
  audit(req.user!.id, 'user.sessions_revoked', 'user', String(req.params.id), {}, ip(req));
  res.json({ ok: true });
});

// ───────────────────────── broadcast & audit ─────────────────────────
r.post('/broadcast', async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().max(1000).optional(), link: z.string().max(300).optional(), audience: z.enum(['all', 'volunteers', 'organizers', 'donors']) }), req.body);
  const where = { all: 'true', volunteers: `role='volunteer'`, organizers: `role IN ('organizer','csr')`, donors: 'is_blood_donor' }[b.audience];
  const ids = (await q(`SELECT id FROM users WHERE account_status='active' AND ${where}`)).map((x) => x.id);
  const n = await notify(ids, { type: 'announcement', category: 'system', title: `📢 ${b.title}`, body: b.body, link: b.link });
  audit(req.user!.id, 'admin.broadcast', 'platform', b.audience, { title: b.title, recipients: n }, ip(req));
  res.json({ sent: n });
});

r.get('/audit', async (req, res) => {
  const rows = await q(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.ip, a.created_at, u.name AS actor_name, u.handle AS actor_handle
       FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
      WHERE ($1::text IS NULL OR a.action LIKE $1 || '%') ORDER BY a.id DESC LIMIT 300`,
    [typeof req.query.action === 'string' ? req.query.action : null],
  );
  res.json(camel(rows));
});

/** Manual trigger for document retention purge (also runs daily). */
r.post('/purge-documents', async (req, res) => {
  const n = await purgeVerificationDocs();
  audit(req.user!.id, 'admin.purge_documents', 'platform', undefined, { purged: n }, ip(req));
  res.json({ purged: n });
});

export async function purgeVerificationDocs() {
  const { env } = await import('../../config/env');
  const rows = await q(
    `SELECT id, documents FROM verification_requests
      WHERE status <> 'pending' AND docs_purged_at IS NULL AND reviewed_at < now() - ($1 || ' days')::interval`,
    [env.docRetentionDays],
  );
  for (const v of rows) {
    for (const d of v.documents) await removeFile(d.key);
    await q(`UPDATE verification_requests SET docs_purged_at=now(), documents = (SELECT coalesce(jsonb_agg(d - 'key'), '[]') FROM jsonb_array_elements(documents) d) WHERE id=$1`, [v.id]);
  }
  return rows.length;
}

export default r;
