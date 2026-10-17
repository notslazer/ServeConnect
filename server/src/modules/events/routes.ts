/* Event management & intelligence (REQ-EVT-1..6), registration/waitlist, QR + manual check-in (REQ-COORD-3/4),
 * attendee filtering by skill (REQ-COORD-1), reviews (REQ-TRUST-2/3), discussion board & polls (REQ-TRUST-4). */
import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { one, q, tx } from '../../db/pool';
import { parse, SKILLS, EVENT_CATEGORIES, zBool } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { assertVerified, optionalAuth, requireAuth, requireRole, AuthUser } from '../../middleware/auth';
import { writeLimiter } from '../../middleware/rateLimit';
import { randomCode, randomToken } from '../../lib/crypto';
import { uploader, checkFiles, IMAGE_TYPES } from '../../lib/upload';
import { putPublic } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { sqlDistance } from '../../lib/geo';
import { USER_CARD_SQL } from '../users/serialize';
import { createPoll, loadPolls, pollSchema } from '../posts/routes';
import { awardMilestones } from '../gamification/service';
import {
  broadcastCounts, checkinToken, checkinUrl, completeEvent, counts, inCheckinWindow, isValidCheckinToken, onEventPublished,
  promoteWaitlist, refreshWeather, uniqueCheckinCode, eventHours, CHECKIN_WINDOW_SEC,
} from './service';

const r = Router();

// ───────────────────────── helpers ─────────────────────────
async function loadEvent(id: string) {
  const e = await one('SELECT * FROM events WHERE id=$1', [id]);
  if (!e) throw notFound('This event does not exist.');
  return e;
}
const isOwner = (u: AuthUser | undefined, e: any) => Boolean(u && (u.id === e.organizer_id || u.role === 'admin'));
async function isLead(u: AuthUser | undefined, eventId: string) {
  if (!u) return false;
  return Boolean(await one('SELECT 1 FROM teams WHERE event_id=$1 AND lead_id=$2', [eventId, u.id]));
}
async function assertManager(u: AuthUser, e: any, allowLead = false) {
  if (isOwner(u, e)) return;
  if (allowLead && (await isLead(u, e.id))) return;
  throw forbidden('Only the event organizer can do that.');
}
async function assertOrganizerActive(u: AuthUser) {
  const row = await one('SELECT account_status FROM users WHERE id=$1', [u.id]);
  if (row?.account_status === 'suspended') throw forbidden('Your account is suspended; events cannot be edited or published.');
}

const EVENT_CARD = `
  e.id, e.title, e.category, e.cover_url, e.status, e.is_outdoor, e.start_at, e.end_at, e.location_name, e.lat, e.lng,
  e.capacity, e.skills_needed, e.created_at,
  (SELECT count(*) FROM event_registrations x WHERE x.event_id=e.id AND x.status IN ('registered','attended'))::int AS registered,
  (SELECT count(*) FROM event_registrations x WHERE x.event_id=e.id AND x.status='waitlisted')::int AS waitlisted,
  json_build_object('id', o.id, 'name', o.name, 'handle', o.handle, 'avatarUrl', o.avatar_url, 'verified', o.verification_status='verified') AS organizer`;

const eventSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(140),
    description: z.string().trim().min(20, 'Describe the event in at least 20 characters').max(10000),
    category: z.enum(EVENT_CATEGORIES),
    startAt: z.string().datetime({ offset: true, message: 'Choose a start date & time' }),
    endAt: z.string().datetime({ offset: true, message: 'Choose an end date & time' }),
    locationName: z.string().trim().max(200).optional(),
    address: z.string().trim().max(300).optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    isOutdoor: z.boolean().default(false),
    capacity: z.number().int().min(1, 'Capacity must be at least 1').max(100000),
    skillsNeeded: z.array(z.enum(SKILLS)).max(10).default([]),
    requirements: z.string().trim().max(3000).optional(),
    minAge: z.number().int().min(13).max(100).nullable().optional(),
    checkinGraceMin: z.number().int().min(5).max(240).default(30),
    reminderOffsets: z.array(z.number().int().min(5).max(10080)).max(4).default([1440, 60]),
    publish: z.boolean().default(false),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), { message: 'End time must be after the start time', path: ['endAt'] });

// ───────────────────────── browse ─────────────────────────
r.get('/', optionalAuth, async (req, res) => {
  const b = parse(
    z.object({
      q: z.string().trim().max(100).optional(),
      category: z.string().optional(),
      skill: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      radiusKm: z.coerce.number().min(1).max(1000).optional(),
      organizerId: z.string().uuid().optional(),
      when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
      sort: z.enum(['soonest', 'nearest', 'newest', 'popular']).default('soonest'),
      outdoor: zBool,
      hasSpots: zBool,
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    req.query,
  );
  const vals: any[] = [];
  const where = [`e.status IN ('published','completed')`];
  if (b.when === 'upcoming') where.push(`e.end_at > now() AND e.status='published'`);
  if (b.when === 'past') where.push(`e.end_at <= now()`);
  if (b.q) {
    vals.push(`%${b.q.toLowerCase()}%`);
    where.push(`(lower(e.title) LIKE $${vals.length} OR lower(e.description) LIKE $${vals.length} OR lower(coalesce(e.location_name,'')) LIKE $${vals.length} OR lower(o.name) LIKE $${vals.length})`);
  }
  if (b.category) { vals.push(b.category); where.push(`e.category=$${vals.length}`); }
  if (b.skill) { vals.push(b.skill); where.push(`$${vals.length} = ANY(e.skills_needed)`); }
  if (b.from) { vals.push(b.from); where.push(`e.start_at >= $${vals.length}::timestamptz`); }
  if (b.to) { vals.push(b.to); where.push(`e.start_at <= $${vals.length}::timestamptz`); }
  if (b.organizerId) { vals.push(b.organizerId); where.push(`e.organizer_id=$${vals.length}`); }
  if (b.outdoor !== undefined) { vals.push(b.outdoor); where.push(`e.is_outdoor=$${vals.length}`); }
  if (b.hasSpots) where.push(`(SELECT count(*) FROM event_registrations x WHERE x.event_id=e.id AND x.status IN ('registered','attended')) < e.capacity`);
  let dist = 'NULL::float';
  if (b.lat !== undefined && b.lng !== undefined) {
    vals.push(b.lat, b.lng);
    dist = sqlDistance('e.lat', 'e.lng', `$${vals.length - 1}`, `$${vals.length}`);
    if (b.radiusKm) { vals.push(b.radiusKm); where.push(`e.lat IS NOT NULL AND ${dist} <= $${vals.length}`); }
  }
  const order = {
    soonest: b.when === 'past' ? 'e.start_at DESC' : 'e.start_at ASC',
    nearest: `${dist} ASC NULLS LAST, e.start_at ASC`,
    newest: 'e.created_at DESC',
    popular: 'registered DESC, e.start_at ASC',
  }[b.sort];
  vals.push(b.limit + 1, b.offset);
  const rows = await q(
    `SELECT ${EVENT_CARD}, ${dist} AS distance_km FROM events e JOIN users o ON o.id=e.organizer_id
      WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );
  res.json({ items: camel(rows.slice(0, b.limit)), hasMore: rows.length > b.limit });
});

r.get('/recommended', requireAuth, async (req, res) => {
  const me = await one('SELECT skills, interests, lat, lng, notification_prefs FROM users WHERE id=$1', [req.user!.id]);
  const vals: any[] = [req.user!.id, me.skills, me.interests];
  let dist = 'NULL::float';
  if (me.lat && me.lng) { vals.push(me.lat, me.lng); dist = sqlDistance('e.lat', 'e.lng', '$4', '$5'); }
  const rows = await q(
    `SELECT ${EVENT_CARD}, ${dist} AS distance_km,
            (cardinality(ARRAY(SELECT unnest(e.skills_needed) INTERSECT SELECT unnest($2::text[]))) * 3
             + CASE WHEN e.category = ANY($3::text[]) THEN 2 ELSE 0 END
             + CASE WHEN e.organizer_id IN (SELECT following_id FROM follows WHERE follower_id=$1) THEN 3 ELSE 0 END
             + CASE WHEN ${dist} IS NOT NULL AND ${dist} < 15 THEN 2 ELSE 0 END) AS score
       FROM events e JOIN users o ON o.id=e.organizer_id
      WHERE e.status='published' AND e.end_at > now() AND e.organizer_id <> $1
        AND NOT EXISTS (SELECT 1 FROM event_registrations x WHERE x.event_id=e.id AND x.user_id=$1 AND x.status <> 'cancelled')
      ORDER BY score DESC, e.start_at ASC LIMIT 10`,
    vals,
  );
  res.json(camel(rows));
});

/** Volunteer: my registrations. Organizer: my events (all statuses). */
r.get('/mine', requireAuth, async (req, res) => {
  if (req.query.as === 'organizer' || (req.user!.role !== 'volunteer' && req.query.as !== 'volunteer')) {
    const rows = await q(`SELECT ${EVENT_CARD}, e.updated_at FROM events e JOIN users o ON o.id=e.organizer_id WHERE e.organizer_id=$1 ORDER BY e.start_at DESC`, [req.user!.id]);
    return res.json(camel(rows));
  }
  const rows = await q(
    `SELECT ${EVENT_CARD}, r.status AS my_status, r.checkin_code, r.checked_in_at, r.hours,
            (SELECT count(*) FROM event_registrations w WHERE w.event_id=e.id AND w.status='waitlisted' AND w.created_at <= r.created_at)::int AS waitlist_position
       FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN users o ON o.id=e.organizer_id
      WHERE r.user_id=$1 AND r.status <> 'cancelled' ORDER BY e.start_at DESC`,
    [req.user!.id],
  );
  res.json(camel(rows));
});

// ───────────────────────── create / update ─────────────────────────
r.post('/', requireAuth, requireRole('organizer', 'csr', 'admin'), writeLimiter, async (req, res) => {
  const b = parse(eventSchema, req.body);
  if (new Date(b.startAt) < new Date(Date.now() - 60_000)) throw badRequest('The start time must be in the future.', { fields: { startAt: 'Must be in the future' } });
  if (b.publish) assertVerified(req.user!, 'publish events');
  const e = await one(
    `INSERT INTO events (organizer_id, title, description, category, start_at, end_at, location_name, address, lat, lng, is_outdoor,
                         capacity, skills_needed, requirements, min_age, checkin_grace_min, reminder_offsets, qr_secret, manual_code, status, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, CASE WHEN $20='published' THEN now() END) RETURNING *`,
    [
      req.user!.id, b.title, b.description, b.category, b.startAt, b.endAt, b.locationName ?? null, b.address ?? null, b.lat ?? null, b.lng ?? null,
      b.isOutdoor, b.capacity, b.skillsNeeded, b.requirements ?? null, b.minAge ?? null, b.checkinGraceMin, b.reminderOffsets,
      randomToken(24), randomCode(6), b.publish ? 'published' : 'draft',
    ],
  );
  if (b.publish) onEventPublished(e.id).catch((x) => console.error(x));
  res.status(201).json(camel(e));
});

r.patch('/:id', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  await assertOrganizerActive(req.user!);
  if (['completed', 'cancelled'].includes(e.status)) throw badRequest(`A ${e.status} event can no longer be edited.`);
  const b = parse(eventSchema.innerType().partial().omit({ publish: true }), req.body);
  const start = b.startAt ?? e.start_at;
  const end = b.endAt ?? e.end_at;
  if (new Date(end) <= new Date(start)) throw badRequest('End time must be after the start time', { fields: { endAt: 'Invalid' } });
  const { registered } = await counts(e.id);
  if (b.capacity !== undefined && b.capacity < registered) throw badRequest(`Capacity can't be lower than the ${registered} volunteers already registered.`);
  const map: Record<string, string> = {
    title: 'title', description: 'description', category: 'category', startAt: 'start_at', endAt: 'end_at', locationName: 'location_name',
    address: 'address', lat: 'lat', lng: 'lng', isOutdoor: 'is_outdoor', capacity: 'capacity', skillsNeeded: 'skills_needed',
    requirements: 'requirements', minAge: 'min_age', checkinGraceMin: 'checkin_grace_min', reminderOffsets: 'reminder_offsets',
  };
  const sets: string[] = [];
  const vals: any[] = [e.id];
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) { vals.push((b as any)[k]); sets.push(`${col}=$${vals.length}`); }
  }
  if (!sets.length) return res.json(camel(e));
  const updated = await tx(async (c) => {
    await c.query('SELECT 1 FROM events WHERE id=$1 FOR UPDATE', [e.id]);
    const u = (await c.query(`UPDATE events SET ${sets.join(', ')}, weather_checked_at=NULL, updated_at=now() WHERE id=$1 RETURNING *`, vals)).rows[0];
    if (b.capacity !== undefined && b.capacity > e.capacity) await promoteWaitlist(c, e.id);
    return u;
  });
  const material = ['startAt', 'endAt', 'locationName', 'address', 'lat'].some((k) => (b as any)[k] !== undefined);
  if (e.status === 'published' && material) {
    const users = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status IN ('registered','waitlisted')`, [e.id])).map((x) => x.user_id);
    await notify(users, {
      type: 'event_updated', category: 'events', priority: 'high', title: `"${e.title}" has changed`,
      body: `New time/place: ${new Date(updated.start_at).toLocaleString('en-IN')} · ${updated.location_name ?? ''}`, link: `/events/${e.id}`,
    });
  }
  broadcastCounts(e.id);
  res.json(camel(updated));
});

r.post('/:id/cover', requireAuth, uploader({ maxMb: 8, maxFiles: 1, field: 'file' }), async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  const [f] = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
  if (!f) throw badRequest('Choose an image.');
  const s = await putPublic(f.buffer, f.mime, 'events');
  const u = await one('UPDATE events SET cover_url=$2, updated_at=now() WHERE id=$1 RETURNING *', [e.id, s.url]);
  res.json(camel(u));
});

r.post('/:id/publish', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  await assertOrganizerActive(req.user!);
  assertVerified(req.user!, 'publish events');
  if (e.status !== 'draft') throw badRequest('Only drafts can be published.');
  if (new Date(e.start_at) < new Date()) throw badRequest('This event starts in the past. Update the date first.');
  const u = await one(`UPDATE events SET status='published', published_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [e.id]);
  onEventPublished(e.id).catch((x) => console.error(x));
  res.json(camel(u));
});

r.post('/:id/cancel', requireAuth, async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, 'Tell volunteers why').max(500) }), req.body);
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  if (e.status !== 'published' && e.status !== 'draft') throw badRequest('This event cannot be cancelled.');
  await q(`UPDATE events SET status='cancelled', updated_at=now() WHERE id=$1`, [e.id]);
  const users = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status IN ('registered','waitlisted')`, [e.id])).map((x) => x.user_id);
  await q(`UPDATE event_registrations SET status='cancelled' WHERE event_id=$1 AND status IN ('registered','waitlisted')`, [e.id]);
  await notify(users, { type: 'event_cancelled', category: 'events', priority: 'high', title: `"${e.title}" was cancelled`, body: b.reason, link: `/events/${e.id}` });
  res.json({ ok: true });
});

r.delete('/:id', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  if (e.status !== 'draft') throw badRequest('Only drafts can be deleted. Cancel a published event instead.');
  await q('DELETE FROM events WHERE id=$1', [e.id]);
  res.json({ ok: true });
});

// ───────────────────────── detail ─────────────────────────
r.get('/:id', optionalAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  const owner = isOwner(req.user, e);
  if (e.status === 'draft' && !owner) throw notFound('This event does not exist.');
  const weather = e.is_outdoor && e.status === 'published' ? await refreshWeather(e.id).catch(() => e.weather) : e.weather;
  const org = await one(
    `SELECT ${USER_CARD_SQL} AS card, (SELECT round(avg(rating)::numeric,2) FROM reviews WHERE organizer_id=u.id)::float AS avg_rating,
            (SELECT count(*) FROM events WHERE organizer_id=u.id AND status='completed')::int AS completed_events
       FROM users u WHERE u.id=$1`,
    [e.organizer_id],
  );
  const c = await counts(e.id);
  const rating = await one('SELECT round(avg(rating)::numeric,2)::float AS avg, count(*)::int AS n FROM reviews WHERE event_id=$1', [e.id]);
  let my: any = null;
  let lead = false;
  if (req.user) {
    my = await one(
      `SELECT r.status, r.checkin_code, r.checked_in_at, r.hours, r.created_at,
              (SELECT count(*) FROM event_registrations w WHERE w.event_id=r.event_id AND w.status='waitlisted' AND w.created_at <= r.created_at)::int AS waitlist_position,
              EXISTS (SELECT 1 FROM reviews v WHERE v.event_id=r.event_id AND v.reviewer_id=r.user_id) AS reviewed,
              (SELECT serial FROM certificates ce WHERE ce.registration_id=r.id) AS certificate_serial,
              (SELECT json_build_object('id', t.id, 'name', t.name, 'conversationId', cv.id) FROM team_members tm JOIN teams t ON t.id=tm.team_id
                 LEFT JOIN conversations cv ON cv.team_id=t.id WHERE t.event_id=r.event_id AND tm.user_id=r.user_id LIMIT 1) AS team
         FROM event_registrations r WHERE r.event_id=$1 AND r.user_id=$2 AND r.status <> 'cancelled'`,
      [e.id, req.user.id],
    );
    lead = await isLead(req.user, e.id);
  }
  const followsOrganizer = req.user ? Boolean(await one('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, e.organizer_id])) : false;
  const { qr_secret, manual_code, ...pub } = e;
  res.json(camel({
    ...pub,
    weather,
    manual_code: owner || lead ? manual_code : undefined,
    organizer: { ...org!.card, avgRating: org!.avg_rating, completedEvents: org!.completed_events, isFollowing: followsOrganizer },
    counts: c,
    rating,
    hours: eventHours(e),
    my_registration: my,
    is_owner: owner,
    is_team_lead: lead,
    checkin_open: e.status === 'published' && inCheckinWindow(e),
  }));
});

// ───────────────────────── registration & waitlist ─────────────────────────
r.post('/:id/register', requireAuth, writeLimiter, async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (user.is_minor && user.guardian_consent !== 'granted') {
    throw forbidden('Volunteers under 18 need parent/guardian consent before joining in-person events. Check Settings → Account.');
  }
  if (!user.email_verified && !user.phone_verified) throw forbidden('Verify your email or phone first.');
  const out = await tx(async (c) => {
    const e = (await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!e) throw notFound('This event does not exist.');
    if (e.status !== 'published') throw badRequest('Registration is closed for this event.');
    if (new Date(e.end_at) < new Date()) throw badRequest('This event has already ended.');
    if (e.organizer_id === user.id) throw badRequest("You can't register for your own event.");
    if (e.min_age && user.date_of_birth) {
      const age = (Date.now() - new Date(user.date_of_birth).getTime()) / (365.25 * 86400_000);
      if (age < e.min_age) throw forbidden(`This event requires volunteers aged ${e.min_age}+.`);
    }
    const ex = (await c.query('SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 FOR UPDATE', [e.id, user.id])).rows[0];
    if (ex && ex.status !== 'cancelled') throw conflict(ex.status === 'waitlisted' ? "You're already on the waitlist." : "You're already registered.", 'already_registered');
    const { registered } = await counts(e.id, c);
    const status = registered < e.capacity ? 'registered' : 'waitlisted';
    const code = await uniqueCheckinCode(c, e.id);
    if (ex) {
      await c.query(`UPDATE event_registrations SET status=$2, checkin_code=$3, created_at=now(), updated_at=now(), checked_in_at=NULL, checkin_method=NULL WHERE id=$1`, [ex.id, status, code]);
    } else {
      await c.query('INSERT INTO event_registrations (event_id, user_id, status, checkin_code) VALUES ($1,$2,$3,$4)', [e.id, user.id, status, code]);
    }
    return { e, status, code };
  });
  broadcastCounts(out.e.id);
  if (out.status === 'registered') {
    await notify([req.user!.id], {
      type: 'registered', category: 'events', title: `You're registered for "${out.e.title}"`,
      body: `Your check-in code is ${out.code}. We'll remind you before it starts.`, link: `/events/${out.e.id}`, dedupeKey: `reg:${out.e.id}:${Date.now()}`,
    });
    await notify([out.e.organizer_id], { type: 'new_registration', category: 'events', title: `${req.user!.name} registered for "${out.e.title}"`, link: `/events/${out.e.id}/manage` });
  }
  res.status(201).json({ status: out.status, checkinCode: out.code });
});

r.post('/:id/cancel-registration', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  if (new Date(e.start_at) < new Date() && e.status === 'published') {
    // allowed, but it will not count as attendance
  }
  await tx(async (c) => {
    await c.query('SELECT 1 FROM events WHERE id=$1 FOR UPDATE', [e.id]);
    const reg = (await c.query(`UPDATE event_registrations SET status='cancelled', updated_at=now() WHERE event_id=$1 AND user_id=$2 AND status IN ('registered','waitlisted') RETURNING id`, [e.id, req.user!.id])).rows[0];
    if (!reg) throw badRequest("You're not registered for this event.");
    await c.query('DELETE FROM team_members WHERE user_id=$1 AND team_id IN (SELECT id FROM teams WHERE event_id=$2)', [req.user!.id, e.id]);
    await promoteWaitlist(c, e.id);
  });
  broadcastCounts(e.id);
  res.json({ ok: true });
});

// ───────────────────────── attendees (organizer / team lead) ─────────────────────────
r.get('/:id/attendees', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e, true);
  const b = parse(z.object({ skill: z.string().optional(), status: z.string().optional(), q: z.string().optional() }), req.query);
  const vals: any[] = [e.id];
  const where = [`r.event_id=$1`, `r.status <> 'cancelled'`];
  if (b.skill) { vals.push(b.skill); where.push(`$${vals.length} = ANY(u.skills)`); }
  if (b.status) { vals.push(b.status); where.push(`r.status=$${vals.length}`); }
  if (b.q) { vals.push(`%${b.q.toLowerCase()}%`); where.push(`(lower(u.name) LIKE $${vals.length} OR lower(u.handle::text) LIKE $${vals.length})`); }
  const rows = await q(
    `SELECT r.id AS registration_id, r.status, r.checkin_code, r.checked_in_at, r.checkin_method, r.hours, r.created_at, r.note,
            ${USER_CARD_SQL} AS user, u.skills, u.is_minor,
            (SELECT count(*) FROM event_registrations n WHERE n.user_id=u.id AND n.status='no_show')::int AS no_show_count,
            (SELECT count(*) FROM event_registrations n WHERE n.user_id=u.id AND n.status='attended')::int AS attended_count,
            (SELECT json_build_object('id', t.id, 'name', t.name) FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.event_id=r.event_id AND tm.user_id=u.id LIMIT 1) AS team,
            (SELECT u2.name FROM users u2 WHERE u2.id=r.registered_by) AS registered_by_name
       FROM event_registrations r JOIN users u ON u.id=r.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE r.status WHEN 'attended' THEN 0 WHEN 'registered' THEN 1 WHEN 'waitlisted' THEN 2 ELSE 3 END, r.created_at`,
    vals,
  );
  res.json(camel(rows));
});

r.get('/:id/attendees.csv', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  const rows = await q(
    `SELECT u.name, u.handle, r.status, r.checkin_code, r.checked_in_at, r.checkin_method, r.hours, array_to_string(u.skills, ';') AS skills
       FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.status <> 'cancelled' ORDER BY u.name`,
    [e.id],
  );
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Name,Username,Status,Check-in code,Checked in at,Method,Hours,Skills', ...rows.map((x) => [x.name, x.handle, x.status, x.checkin_code, x.checked_in_at?.toISOString?.() ?? '', x.checkin_method, x.hours, x.skills].map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendees-${e.id.slice(0, 8)}.csv"`);
  res.send(csv);
});

r.patch('/:id/attendees/:userId', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e, true);
  const b = parse(z.object({ status: z.enum(['attended', 'no_show', 'registered']).optional(), hours: z.number().min(0).max(48).optional(), note: z.string().max(300).optional() }), req.body);
  const reg = await one(`SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 AND status <> 'cancelled'`, [e.id, req.params.userId]);
  if (!reg) throw notFound('Registration not found.');
  if (b.status === 'registered' && reg.status === 'waitlisted' && !isOwner(req.user, e)) throw forbidden();
  const markAttended = b.status === 'attended' && reg.status !== 'attended';
  const u = await one(
    `UPDATE event_registrations SET status=coalesce($3,status), hours=coalesce($4,hours), note=coalesce($5,note),
            checked_in_at = CASE WHEN $6 THEN coalesce(checked_in_at, now()) WHEN $3='no_show' THEN NULL ELSE checked_in_at END,
            checkin_method = CASE WHEN $6 THEN coalesce(checkin_method,'organizer') WHEN $3='no_show' THEN NULL ELSE checkin_method END,
            checked_in_by = CASE WHEN $6 THEN $7 ELSE checked_in_by END, updated_at=now()
      WHERE id=$1 AND event_id=$2 RETURNING *`,
    [reg.id, e.id, b.status ?? null, b.hours ?? null, b.note ?? null, markAttended, req.user!.id],
  );
  if (markAttended && e.status === 'completed') {
    if (u.hours === null) await q('UPDATE event_registrations SET hours=$2 WHERE id=$1', [reg.id, eventHours(e)]);
    const { issueCertificates } = await import('./service');
    await issueCertificates(e.id);
    awardMilestones(reg.user_id).catch(() => {});
  }
  broadcastCounts(e.id);
  res.json(camel(u));
});

r.delete('/:id/attendees/:userId', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  await tx(async (c) => {
    await c.query('SELECT 1 FROM events WHERE id=$1 FOR UPDATE', [e.id]);
    await c.query(`UPDATE event_registrations SET status='cancelled' WHERE event_id=$1 AND user_id=$2`, [e.id, req.params.userId]);
    await c.query('DELETE FROM team_members WHERE user_id=$1 AND team_id IN (SELECT id FROM teams WHERE event_id=$2)', [req.params.userId, e.id]);
    await promoteWaitlist(c, e.id);
  });
  await notify([String(req.params.userId)], { type: 'removed', category: 'events', title: `Your registration for "${e.title}" was cancelled by the organizer`, link: `/events/${e.id}` });
  broadcastCounts(e.id);
  res.json({ ok: true });
});

// ───────────────────────── check-in ─────────────────────────
/** Organizer/lead display: rotating QR code + event code (REQ-COORD-3/4). */
r.get('/:id/checkin-qr', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e, true);
  const token = checkinToken(e);
  const url = checkinUrl(e.id, token);
  const windowEnds = (Math.floor(Date.now() / 1000 / CHECKIN_WINDOW_SEC) + 1) * CHECKIN_WINDOW_SEC * 1000;
  res.json({
    url,
    qr: await QRCode.toDataURL(url, { margin: 1, width: 420, errorCorrectionLevel: 'M' }),
    eventCode: e.manual_code,
    refreshInMs: windowEnds - Date.now(),
    open: inCheckinWindow(e),
    counts: await counts(e.id),
  });
});

async function doCheckin(eventId: string, userId: string, method: 'qr' | 'event_code' | 'manual', by: string) {
  const out = await tx(async (c) => {
    const e = (await c.query('SELECT * FROM events WHERE id=$1', [eventId])).rows[0];
    if (!e) throw notFound();
    if (e.status !== 'published') throw badRequest('Check-in is closed for this event.');
    if (!inCheckinWindow(e)) throw badRequest('Check-in opens 1 hour before the event starts and closes when it ends.');
    const reg = (await c.query(`SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 FOR UPDATE`, [eventId, userId])).rows[0];
    if (!reg || reg.status === 'cancelled') throw badRequest('This volunteer is not registered for the event.');
    if (reg.status === 'waitlisted') throw badRequest('This volunteer is still on the waitlist.');
    if (reg.status === 'attended' || reg.checked_in_at) throw conflict('Already checked in.', 'duplicate_checkin'); // business rule: once only
    const u = (await c.query(
      `UPDATE event_registrations SET status='attended', checked_in_at=now(), checkin_method=$2, checked_in_by=$3, updated_at=now() WHERE id=$1 RETURNING *`,
      [reg.id, method, by],
    )).rows[0];
    return { e, reg: u };
  });
  broadcastCounts(eventId);
  return out;
}

/** Volunteer scans the QR (token) or types the event code. */
r.post('/:id/checkin', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ token: z.string().optional(), eventCode: z.string().trim().toUpperCase().optional() }), req.body);
  const e = await loadEvent(String(req.params.id));
  let method: 'qr' | 'event_code';
  if (b.token) {
    if (!isValidCheckinToken(e, b.token)) throw badRequest('This QR code has expired. Ask the organizer to show the latest code and scan again.');
    method = 'qr';
  } else if (b.eventCode) {
    if (b.eventCode !== e.manual_code) throw badRequest('That event code is not correct.');
    method = 'event_code';
  } else throw badRequest('Scan the QR code or enter the event code.');
  const { reg } = await doCheckin(e.id, req.user!.id, method, req.user!.id);
  emitToOrganizer(e, req.user!.name);
  res.json({ ok: true, checkedInAt: reg.checked_in_at, title: e.title });
});

/** Organizer/lead enters a volunteer's personal check-in code (fallback when the volunteer can't scan). */
r.post('/:id/checkin/manual', requireAuth, async (req, res) => {
  const b = parse(z.object({ checkinCode: z.string().trim().toUpperCase().min(4) }), req.body);
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e, true);
  const reg = await one(`SELECT r.user_id, u.name FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.checkin_code=$2`, [e.id, b.checkinCode]);
  if (!reg) throw notFound('No registration matches that code.');
  const out = await doCheckin(e.id, reg.user_id, 'manual', req.user!.id);
  emitToOrganizer(e, reg.name);
  await notify([reg.user_id], { type: 'checked_in', category: 'events', title: `Checked in to "${e.title}"`, body: 'Thanks for showing up!', link: `/events/${e.id}`, dedupeKey: `checkin:${e.id}` });
  res.json({ ok: true, name: reg.name, checkedInAt: out.reg.checked_in_at });
});

function emitToOrganizer(e: any, name: string) {
  import('../../lib/socket').then(async ({ emitToUser }) => {
    const leads = (await q('SELECT DISTINCT lead_id FROM teams WHERE event_id=$1 AND lead_id IS NOT NULL', [e.id])).map((x) => x.lead_id);
    for (const u of new Set([e.organizer_id, ...leads])) emitToUser(u, 'checkin', { eventId: e.id, name });
  });
}

r.post('/:id/complete', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  if (e.status !== 'published') throw badRequest('Only published events can be marked complete.');
  if (new Date(e.start_at) > new Date()) throw badRequest("The event hasn't started yet.");
  await completeEvent(e.id);
  res.json(camel(await loadEvent(e.id)));
});

r.get('/:id/analytics', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  const c = await counts(e.id);
  const extra = await one(
    `SELECT count(*) FILTER (WHERE status='no_show')::int AS no_shows,
            count(*) FILTER (WHERE status='cancelled')::int AS cancellations,
            count(*) FILTER (WHERE checkin_method='qr')::int AS via_qr,
            count(*) FILTER (WHERE checkin_method IN ('manual','event_code','organizer'))::int AS via_manual,
            coalesce(sum(hours) FILTER (WHERE status='attended'),0)::float AS total_hours
       FROM event_registrations WHERE event_id=$1`,
    [e.id],
  );
  const timeline = await q(`SELECT date_trunc('day', created_at) AS day, count(*)::int AS n FROM event_registrations WHERE event_id=$1 GROUP BY 1 ORDER BY 1`, [e.id]);
  const skills = await q(
    `SELECT s AS skill, count(*)::int AS n FROM event_registrations r JOIN users u ON u.id=r.user_id, unnest(u.skills) s
      WHERE r.event_id=$1 AND r.status IN ('registered','attended') GROUP BY s ORDER BY n DESC LIMIT 10`,
    [e.id],
  );
  const rating = await one('SELECT round(avg(rating)::numeric,2)::float AS avg, count(*)::int AS n FROM reviews WHERE event_id=$1', [e.id]);
  res.json(camel({ ...c, ...extra, capacity: e.capacity, rating, timeline, skills }));
});

// ───────────────────────── gallery (REQ-EVT-6) ─────────────────────────
r.get('/:id/gallery', async (req, res) => {
  const rows = await q(
    `SELECT g.id, g.url, g.caption, g.created_at, ${USER_CARD_SQL} AS uploader FROM event_gallery g JOIN users u ON u.id=g.uploader_id
      WHERE g.event_id=$1 ORDER BY g.created_at DESC`,
    [req.params.id],
  );
  res.json(camel(rows));
});

r.post('/:id/gallery', requireAuth, uploader({ maxMb: 8, maxFiles: 10, field: 'files' }), async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  if (e.status !== 'completed') throw badRequest('Photos can be added once the event is marked complete.');
  const caption = typeof req.body.caption === 'string' ? req.body.caption.slice(0, 300) : null;
  const files = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
  if (!files.length) throw badRequest('Choose at least one photo.');
  const urls: string[] = [];
  for (const f of files) {
    const s = await putPublic(f.buffer, f.mime, 'gallery');
    await q('INSERT INTO event_gallery (event_id, uploader_id, url, caption) VALUES ($1,$2,$3,$4)', [e.id, req.user!.id, s.url, caption]);
    urls.push(s.url);
  }
  // Share to followers' feeds as a gallery post.
  await q(`INSERT INTO posts (author_id, kind, body, media, event_id) VALUES ($1,'gallery',$2,$3,$4)`, [
    e.organizer_id, caption || `📸 Photos from ${e.title}`, JSON.stringify(urls.slice(0, 6).map((url) => ({ url, type: 'image' }))), e.id,
  ]);
  const attendees = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status='attended'`, [e.id])).map((x) => x.user_id);
  await notify(attendees, { type: 'gallery', category: 'social', title: `New photos from "${e.title}"`, link: `/events/${e.id}?tab=gallery`, dedupeKey: `gallery:${e.id}:${new Date().toISOString().slice(0, 13)}` });
  res.status(201).json({ added: urls.length });
});

r.delete('/:id/gallery/:photoId', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  await q('DELETE FROM event_gallery WHERE id=$1 AND event_id=$2', [req.params.photoId, e.id]);
  res.json({ ok: true });
});

// ───────────────────────── reviews ─────────────────────────
r.get('/:id/reviews', async (req, res) => {
  const rows = await q(
    `SELECT v.id, v.rating, v.body, v.created_at, ${USER_CARD_SQL} AS reviewer FROM reviews v JOIN users u ON u.id=v.reviewer_id
      WHERE v.event_id=$1 ORDER BY v.created_at DESC`,
    [req.params.id],
  );
  const dist = await q('SELECT rating, count(*)::int AS n FROM reviews WHERE event_id=$1 GROUP BY rating', [req.params.id]);
  res.json({ items: camel(rows), distribution: dist });
});

r.post('/:id/reviews', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ rating: z.number().int().min(1, 'Choose 1–5 stars').max(5), body: z.string().trim().max(2000).optional() }), req.body);
  const e = await loadEvent(String(req.params.id));
  if (e.status !== 'completed') throw badRequest('You can review an event once it is complete.');
  const reg = await one(`SELECT 1 FROM event_registrations WHERE event_id=$1 AND user_id=$2 AND status='attended' AND checked_in_at IS NOT NULL`, [e.id, req.user!.id]);
  if (!reg) throw forbidden('Only volunteers whose attendance was verified can review this event.');
  const v = await one(
    `INSERT INTO reviews (event_id, reviewer_id, organizer_id, rating, body) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, reviewer_id) DO NOTHING RETURNING *`,
    [e.id, req.user!.id, e.organizer_id, b.rating, b.body ?? null],
  );
  if (!v) throw conflict('You have already reviewed this event.');
  await notify([e.organizer_id], { type: 'review', category: 'social', title: `${req.user!.name} rated "${e.title}" ${'★'.repeat(b.rating)}`, body: b.body?.slice(0, 120), link: `/events/${e.id}?tab=reviews` });
  awardMilestones(req.user!.id).catch(() => {});
  res.status(201).json(camel(v));
});

// ───────────────────────── discussion board (threaded Q&A) ─────────────────────────
r.get('/:id/discussions', optionalAuth, async (req, res) => {
  const rows = await q(
    `SELECT d.id, d.parent_id, d.body, d.is_pinned, d.created_at, d.deleted_at IS NOT NULL AS deleted, ${USER_CARD_SQL} AS author,
            (d.author_id = e.organizer_id) AS by_organizer
       FROM discussions d JOIN users u ON u.id=d.author_id JOIN events e ON e.id=d.event_id
      WHERE d.event_id=$1 ORDER BY d.is_pinned DESC, d.created_at ASC`,
    [req.params.id],
  );
  const items = rows.map((x) => (x.deleted ? { ...x, body: '[deleted]' } : x));
  res.json(camel(items));
});

r.post('/:id/discussions', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(2, 'Write your question or answer').max(3000), parentId: z.string().uuid().optional() }), req.body);
  const e = await loadEvent(String(req.params.id));
  if (e.status === 'draft') throw notFound();
  let parent: any = null;
  if (b.parentId) {
    parent = await one('SELECT id, author_id FROM discussions WHERE id=$1 AND event_id=$2', [b.parentId, e.id]);
    if (!parent) throw badRequest('That thread no longer exists.');
  }
  const d = await one('INSERT INTO discussions (event_id, author_id, parent_id, body) VALUES ($1,$2,$3,$4) RETURNING *', [e.id, req.user!.id, b.parentId ?? null, b.body]);
  // Notify the organizer and everyone who engaged in that thread.
  const rootId = parent?.id;
  const participants = rootId
    ? (await q('SELECT DISTINCT author_id FROM discussions WHERE id=$1 OR parent_id=$1', [rootId])).map((x) => x.author_id)
    : [];
  await notify([e.organizer_id, ...participants].filter((x) => x !== req.user!.id), {
    type: 'discussion', category: 'social', title: `${req.user!.name} ${parent ? 'replied in' : 'asked a question on'} "${e.title}"`,
    body: b.body.slice(0, 140), link: `/events/${e.id}?tab=discussion`,
  });
  res.status(201).json(camel(d));
});

r.delete('/:id/discussions/:did', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  const d = await one('SELECT * FROM discussions WHERE id=$1 AND event_id=$2', [req.params.did, e.id]);
  if (!d) throw notFound();
  if (d.author_id !== req.user!.id && !isOwner(req.user, e)) throw forbidden();
  await q('UPDATE discussions SET deleted_at=now() WHERE id=$1', [d.id]);
  res.json({ ok: true });
});

r.post('/:id/discussions/:did/pin', requireAuth, async (req, res) => {
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  const d = await one('UPDATE discussions SET is_pinned = NOT is_pinned WHERE id=$1 AND event_id=$2 RETURNING is_pinned', [req.params.did, e.id]);
  res.json({ pinned: d?.is_pinned ?? false });
});

// ───────────────────────── polls ─────────────────────────
r.get('/:id/polls', optionalAuth, async (req, res) => {
  res.json(await loadPolls('p.event_id=$1', [req.params.id], req.user?.id));
});
r.post('/:id/polls', requireAuth, async (req, res) => {
  const b = parse(pollSchema, req.body);
  const e = await loadEvent(String(req.params.id));
  await assertManager(req.user!, e);
  const id = await tx((c) => createPoll(c, { creatorId: req.user!.id, ...b, eventId: e.id }));
  const users = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status IN ('registered','attended','waitlisted')`, [e.id])).map((x) => x.user_id);
  await notify(users, { type: 'poll', category: 'events', title: `New poll on "${e.title}"`, body: b.question, link: `/events/${e.id}?tab=discussion` });
  const [poll] = await loadPolls('p.id=$1', [id], req.user!.id);
  res.status(201).json(poll);
});

export default r;
