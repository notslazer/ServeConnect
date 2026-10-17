/* Team formation inside an event, role/lead assignment, auto-grouping by skill, and a group chat per team (REQ-COORD-2). */
import { Router } from 'express';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { one, q, tx } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { requireAuth, AuthUser } from '../../middleware/auth';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { USER_CARD_SQL } from '../users/serialize';

const r = Router();

async function eventFor(eventId: string) {
  const e = await one('SELECT * FROM events WHERE id=$1', [eventId]);
  if (!e) throw notFound('Event not found.');
  return e;
}
function assertOwner(u: AuthUser, e: any) {
  if (u.id !== e.organizer_id && u.role !== 'admin') throw forbidden('Only the organizer can manage teams.');
}
async function teamWithEvent(teamId: string) {
  const t = await one('SELECT t.*, e.organizer_id, e.title AS event_title FROM teams t JOIN events e ON e.id=t.event_id WHERE t.id=$1', [teamId]);
  if (!t) throw notFound('Team not found.');
  return t;
}

/** Keeps the team's group chat membership in sync: members + lead + organizer. */
async function syncConversation(c: PoolClient, teamId: string) {
  const t = (await c.query('SELECT t.*, e.organizer_id, e.title AS event_title FROM teams t JOIN events e ON e.id=t.event_id WHERE t.id=$1', [teamId])).rows[0];
  let conv = (await c.query('SELECT id FROM conversations WHERE team_id=$1', [teamId])).rows[0];
  if (!conv) {
    conv = (await c.query(`INSERT INTO conversations (type, team_id, title) VALUES ('team', $1, $2) RETURNING id`, [teamId, `${t.name} · ${t.event_title}`])).rows[0];
  } else {
    await c.query('UPDATE conversations SET title=$2 WHERE id=$1', [conv.id, `${t.name} · ${t.event_title}`]);
  }
  const members = (await c.query('SELECT user_id FROM team_members WHERE team_id=$1', [teamId])).rows.map((x) => x.user_id);
  const all = [...new Set([...members, t.lead_id, t.organizer_id].filter(Boolean))];
  await c.query('DELETE FROM conversation_members WHERE conversation_id=$1 AND NOT (user_id = ANY($2::uuid[]))', [conv.id, all]);
  for (const u of all) await c.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [conv.id, u]);
  return conv.id as string;
}

async function assertRegistered(c: PoolClient, eventId: string, userIds: string[]) {
  if (!userIds.length) return;
  const ok = (await c.query(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND user_id = ANY($2) AND status IN ('registered','attended')`, [eventId, userIds])).rows;
  if (ok.length !== new Set(userIds).size) throw badRequest('Only volunteers registered for this event can be added to a team.');
}

r.get('/events/:eventId/teams', requireAuth, async (req, res) => {
  const e = await eventFor(String(req.params.eventId));
  const manager = req.user!.id === e.organizer_id || req.user!.role === 'admin';
  const rows = await q(
    `SELECT t.id, t.name, t.role_description, t.created_at, cv.id AS conversation_id,
            (SELECT ${USER_CARD_SQL} FROM users u WHERE u.id=t.lead_id) AS lead,
            (SELECT coalesce(json_agg(json_build_object('user', ${USER_CARD_SQL}, 'role', tm.role, 'skills', u.skills) ORDER BY u.name), '[]')
               FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=t.id) AS members
       FROM teams t LEFT JOIN conversations cv ON cv.team_id=t.id
      WHERE t.event_id=$1 ORDER BY t.created_at`,
    [e.id],
  );
  const visible = manager ? rows : rows.filter((t) => t.lead?.id === req.user!.id || t.members.some((m: any) => m.user.id === req.user!.id));
  res.json(camel(visible));
});

const teamSchema = z.object({
  name: z.string().trim().min(2, 'Name the team').max(60),
  roleDescription: z.string().trim().max(300).optional(),
  leadId: z.string().uuid().nullable().optional(),
  memberIds: z.array(z.string().uuid()).max(200).default([]),
});

r.post('/events/:eventId/teams', requireAuth, async (req, res) => {
  const b = parse(teamSchema, req.body);
  const e = await eventFor(String(req.params.eventId));
  assertOwner(req.user!, e);
  if (['completed', 'cancelled'].includes(e.status)) throw badRequest('Teams cannot be changed after the event ends.');
  const id = await tx(async (c) => {
    const members = [...new Set([...b.memberIds, ...(b.leadId ? [b.leadId] : [])])];
    await assertRegistered(c, e.id, members);
    // A volunteer belongs to at most one team per event.
    await c.query('DELETE FROM team_members WHERE user_id = ANY($1) AND team_id IN (SELECT id FROM teams WHERE event_id=$2)', [members, e.id]);
    const t = (await c.query('INSERT INTO teams (event_id, name, role_description, lead_id) VALUES ($1,$2,$3,$4) RETURNING id', [e.id, b.name, b.roleDescription ?? null, b.leadId ?? null])).rows[0];
    for (const m of members) await c.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3)', [t.id, m, m === b.leadId ? 'Team lead' : null]);
    await syncConversation(c, t.id);
    return t.id;
  });
  const recipients = [...new Set([...b.memberIds, ...(b.leadId ? [b.leadId] : [])])];
  await notify(recipients, { type: 'team', category: 'events', title: `You were added to team "${b.name}" for "${e.title}"`, body: b.roleDescription, link: `/events/${e.id}?tab=teams` });
  if (b.leadId) await notify([b.leadId], { type: 'team_lead', category: 'events', title: `You are the team lead of "${b.name}"`, body: 'You can check in team members and see the event code.', link: `/events/${e.id}/manage` });
  res.status(201).json({ id });
});

/** Auto-forms teams by grouping unassigned registered volunteers by their primary matching skill. */
r.post('/events/:eventId/teams/auto', requireAuth, async (req, res) => {
  const b = parse(z.object({ maxSize: z.number().int().min(2).max(50).default(8) }), req.body);
  const e = await eventFor(String(req.params.eventId));
  assertOwner(req.user!, e);
  const unassigned = await q(
    `SELECT u.id, u.skills FROM event_registrations r JOIN users u ON u.id=r.user_id
      WHERE r.event_id=$1 AND r.status IN ('registered','attended')
        AND NOT EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.event_id=$1 AND tm.user_id=u.id)`,
    [e.id],
  );
  if (!unassigned.length) throw badRequest('Everyone registered is already in a team.');
  const needed: string[] = e.skills_needed?.length ? e.skills_needed : [];
  const groups = new Map<string, string[]>();
  for (const u of unassigned) {
    const key = needed.find((s) => u.skills.includes(s)) ?? u.skills[0] ?? 'general';
    groups.set(key, [...(groups.get(key) ?? []), u.id]);
  }
  let created = 0;
  await tx(async (c) => {
    for (const [skill, ids] of groups) {
      for (let i = 0; i < ids.length; i += b.maxSize) {
        const chunk = ids.slice(i, i + b.maxSize);
        const label = skill.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
        const name = ids.length > b.maxSize ? `${label} ${i / b.maxSize + 1}` : label;
        const t = (await c.query('INSERT INTO teams (event_id, name, role_description, lead_id) VALUES ($1,$2,$3,$4) RETURNING id', [e.id, name, `${label} volunteers`, chunk[0]])).rows[0];
        for (const m of chunk) await c.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3)', [t.id, m, m === chunk[0] ? 'Team lead' : null]);
        await syncConversation(c, t.id);
        created++;
      }
    }
  });
  await notify(unassigned.map((u) => u.id), { type: 'team', category: 'events', title: `You've been assigned to a team for "${e.title}"`, link: `/events/${e.id}?tab=teams` });
  res.json({ created, assigned: unassigned.length });
});

r.patch('/:teamId', requireAuth, async (req, res) => {
  const b = parse(teamSchema.partial().omit({ memberIds: true }), req.body);
  const t = await teamWithEvent(String(req.params.teamId));
  assertOwner(req.user!, { organizer_id: t.organizer_id });
  await tx(async (c) => {
    if (b.leadId) {
      await assertRegistered(c, t.event_id, [b.leadId]);
      await c.query('DELETE FROM team_members WHERE user_id=$1 AND team_id IN (SELECT id FROM teams WHERE event_id=$2) AND team_id<>$3', [b.leadId, t.event_id, t.id]);
      await c.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (team_id, user_id) DO UPDATE SET role=$3', [t.id, b.leadId, 'Team lead']);
    }
    await c.query('UPDATE teams SET name=coalesce($2,name), role_description=coalesce($3,role_description), lead_id=CASE WHEN $5 THEN $4 ELSE lead_id END WHERE id=$1', [
      t.id, b.name ?? null, b.roleDescription ?? null, b.leadId ?? null, b.leadId !== undefined,
    ]);
    await syncConversation(c, t.id);
  });
  if (b.leadId && b.leadId !== t.lead_id) await notify([b.leadId], { type: 'team_lead', category: 'events', title: `You are now lead of "${b.name ?? t.name}"`, link: `/events/${t.event_id}/manage` });
  res.json({ ok: true });
});

r.delete('/:teamId', requireAuth, async (req, res) => {
  const t = await teamWithEvent(String(req.params.teamId));
  assertOwner(req.user!, { organizer_id: t.organizer_id });
  await q('DELETE FROM teams WHERE id=$1', [t.id]);
  res.json({ ok: true });
});

r.post('/:teamId/members', requireAuth, async (req, res) => {
  const b = parse(z.object({ userIds: z.array(z.string().uuid()).min(1).max(200), role: z.string().trim().max(60).optional() }), req.body);
  const t = await teamWithEvent(String(req.params.teamId));
  assertOwner(req.user!, { organizer_id: t.organizer_id });
  await tx(async (c) => {
    await assertRegistered(c, t.event_id, b.userIds);
    await c.query('DELETE FROM team_members WHERE user_id = ANY($1) AND team_id IN (SELECT id FROM teams WHERE event_id=$2) AND team_id<>$3', [b.userIds, t.event_id, t.id]);
    for (const u of b.userIds) await c.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (team_id,user_id) DO UPDATE SET role=coalesce($3, team_members.role)', [t.id, u, b.role ?? null]);
    await syncConversation(c, t.id);
  });
  await notify(b.userIds, { type: 'team', category: 'events', title: `You were added to team "${t.name}" for "${t.event_title}"`, link: `/events/${t.event_id}?tab=teams` });
  res.json({ ok: true });
});

r.patch('/:teamId/members/:userId', requireAuth, async (req, res) => {
  const b = parse(z.object({ role: z.string().trim().max(60).nullable() }), req.body);
  const t = await teamWithEvent(String(req.params.teamId));
  assertOwner(req.user!, { organizer_id: t.organizer_id });
  await q('UPDATE team_members SET role=$3 WHERE team_id=$1 AND user_id=$2', [t.id, req.params.userId, b.role]);
  res.json({ ok: true });
});

r.delete('/:teamId/members/:userId', requireAuth, async (req, res) => {
  const t = await teamWithEvent(String(req.params.teamId));
  assertOwner(req.user!, { organizer_id: t.organizer_id });
  await tx(async (c) => {
    await c.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [t.id, req.params.userId]);
    if (t.lead_id === req.params.userId) await c.query('UPDATE teams SET lead_id=NULL WHERE id=$1', [t.id]);
    await syncConversation(c, t.id);
  });
  res.json({ ok: true });
});

export default r;
