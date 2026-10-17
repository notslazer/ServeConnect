/* CSR (corporate) accounts: employee roster via invite code, bulk event registration and impact reporting. */
import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { requireAuth, requireRole } from '../../middleware/auth';
import { randomCode } from '../../lib/crypto';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { USER_CARD_SQL } from '../users/serialize';
import { counts, uniqueCheckinCode, broadcastCounts } from '../events/service';

const r = Router();
r.use(requireAuth, requireRole('csr', 'admin'));

r.get('/members', async (req, res) => {
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user, m.joined_at, u.skills,
            (SELECT coalesce(sum(hours),0) FROM event_registrations r WHERE r.user_id=u.id AND r.status='attended')::float AS hours,
            (SELECT count(*) FROM event_registrations r WHERE r.user_id=u.id AND r.status='attended')::int AS events
       FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND u.account_status='active' ORDER BY u.name`,
    [req.user!.id],
  );
  const me = await one('SELECT csr_invite_code FROM users WHERE id=$1', [req.user!.id]);
  res.json(camel({ inviteCode: me.csr_invite_code, members: rows.map((x) => ({ ...x.user, joinedAt: x.joined_at, skills: x.skills, hours: x.hours, events: x.events })) }));
});

r.post('/invite-code/rotate', async (req, res) => {
  const u = await one('UPDATE users SET csr_invite_code=$2 WHERE id=$1 RETURNING csr_invite_code', [req.user!.id, randomCode(8)]);
  res.json({ inviteCode: u.csr_invite_code });
});

r.delete('/members/:userId', async (req, res) => {
  await q('DELETE FROM company_members WHERE company_id=$1 AND user_id=$2', [req.user!.id, req.params.userId]);
  await q('UPDATE users SET company_id=NULL WHERE id=$1 AND company_id=$2', [req.params.userId, req.user!.id]);
  res.json({ ok: true });
});

/** Registers several employees at once, respecting capacity (overflow goes to the waitlist). */
r.post('/events/:eventId/bulk-register', async (req, res) => {
  const b = parse(z.object({ userIds: z.array(z.string().uuid()).min(1).max(500) }), req.body);
  const members = (await q('SELECT m.user_id FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.user_id = ANY($2) AND u.account_status=$3', [req.user!.id, b.userIds, 'active'])).map((x) => x.user_id);
  if (!members.length) throw badRequest('None of the selected people are in your company team.');
  const result = { registered: 0, waitlisted: 0, skipped: 0 };
  const ev = await tx(async (c) => {
    const e = (await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [req.params.eventId])).rows[0];
    if (!e) throw notFound('Event not found.');
    if (e.status !== 'published' || new Date(e.end_at) < new Date()) throw badRequest('Registration is closed for this event.');
    let { registered } = await counts(e.id, c);
    for (const uid of members) {
      const u = (await c.query('SELECT is_minor, guardian_consent FROM users WHERE id=$1', [uid])).rows[0];
      const ex = (await c.query('SELECT status FROM event_registrations WHERE event_id=$1 AND user_id=$2', [e.id, uid])).rows[0];
      if ((ex && ex.status !== 'cancelled') || (u.is_minor && u.guardian_consent !== 'granted')) { result.skipped++; continue; }
      const status = registered < e.capacity ? 'registered' : 'waitlisted';
      const code = await uniqueCheckinCode(c, e.id);
      await c.query(
        `INSERT INTO event_registrations (event_id, user_id, status, checkin_code, registered_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status=$3, checkin_code=$4, registered_by=$5, created_at=now(), updated_at=now()`,
        [e.id, uid, status, code, req.user!.id],
      );
      if (status === 'registered') { registered++; result.registered++; } else result.waitlisted++;
    }
    return e;
  });
  await notify(members, { type: 'csr_registered', category: 'events', title: `${req.user!.name} registered you for "${ev.title}"`, body: 'Open the event to see your check-in code.', link: `/events/${ev.id}` });
  broadcastCounts(ev.id);
  res.json(result);
});

async function impact(companyId: string) {
  const summary = await one(
    `SELECT count(DISTINCT r.user_id)::int AS participants, count(*)::int AS participations, coalesce(sum(r.hours),0)::float AS hours,
            count(DISTINCT r.event_id)::int AS events, count(DISTINCT e.organizer_id)::int AS organizations
       FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN company_members m ON m.user_id=r.user_id AND m.company_id=$1
      WHERE r.status='attended'`,
    [companyId],
  );
  const byMonth = await q(
    `SELECT to_char(date_trunc('month', e.start_at), 'YYYY-MM') AS month, coalesce(sum(r.hours),0)::float AS hours, count(*)::int AS participations
       FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN company_members m ON m.user_id=r.user_id AND m.company_id=$1
      WHERE r.status='attended' GROUP BY 1 ORDER BY 1`,
    [companyId],
  );
  const byCategory = await q(
    `SELECT e.category, coalesce(sum(r.hours),0)::float AS hours FROM event_registrations r JOIN events e ON e.id=r.event_id
       JOIN company_members m ON m.user_id=r.user_id AND m.company_id=$1 WHERE r.status='attended' GROUP BY 1 ORDER BY 2 DESC`,
    [companyId],
  );
  const byEvent = await q(
    `SELECT e.id, e.title, e.start_at, o.name AS organizer, count(*)::int AS employees, coalesce(sum(r.hours),0)::float AS hours
       FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN users o ON o.id=e.organizer_id
       JOIN company_members m ON m.user_id=r.user_id AND m.company_id=$1
      WHERE r.status='attended' GROUP BY e.id, o.name ORDER BY e.start_at DESC LIMIT 100`,
    [companyId],
  );
  return camel({ summary, byMonth, byCategory, byEvent });
}

r.get('/impact', async (req, res) => res.json(await impact(req.user!.id)));

r.get('/impact.csv', async (req, res) => {
  const rows = await q(
    `SELECT u.name, e.title, e.start_at, o.name AS organizer, e.category, r.hours
       FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id JOIN users o ON o.id=e.organizer_id
       JOIN company_members m ON m.user_id=r.user_id AND m.company_id=$1 WHERE r.status='attended' ORDER BY e.start_at DESC`,
    [req.user!.id],
  );
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Employee,Event,Date,Organizer,Category,Verified hours', ...rows.map((x) => [x.name, x.title, new Date(x.start_at).toISOString().slice(0, 10), x.organizer, x.category, x.hours].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="csr-impact-report.csv"');
  res.send(csv);
});

export default r;
