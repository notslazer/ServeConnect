/* Profiles, privacy, donor settings, follow graph, discovery (REQ-PROF-3..6, REQ-ENG-1, REQ-ENG-5) */
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { one, q, tx } from '../../db/pool';
import { parse, SKILLS, BLOOD_GROUPS, zBool } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { optionalAuth, requireAuth, ip } from '../../middleware/auth';
import { blindIndex, decrypt, encrypt } from '../../lib/crypto';
import { selfView, publicView, USER_CARD_SQL } from './serialize';
import { uploader, checkFiles, IMAGE_TYPES } from '../../lib/upload';
import { putPublic } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { audit } from '../admin/audit';
import { sqlDistance } from '../../lib/geo';

const r = Router();
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function findUser(idOrHandle: string) {
  return isUuid(idOrHandle)
    ? one(`SELECT * FROM users WHERE id=$1 AND account_status<>'deleted'`, [idOrHandle])
    : one(`SELECT * FROM users WHERE handle=$1 AND account_status<>'deleted'`, [idOrHandle.replace(/^@/, '')]);
}

// ───────────────────────── my account ─────────────────────────
r.get('/me', requireAuth, async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  res.json(await selfView(u));
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  handle: z.string().trim().regex(/^[a-zA-Z0-9_.]{3,30}$/, 'Username: 3–30 letters, numbers, _ or .').optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  website: z.string().trim().url('Enter a full URL starting with https://').max(200).nullable().optional().or(z.literal('').transform(() => null)),
  locationName: z.string().trim().max(160).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  skills: z.array(z.enum(SKILLS)).max(15).optional(),
  interests: z.array(z.string().max(40)).max(15).optional(),
  orgType: z.enum(['ngo', 'independent', 'company']).optional(),
  orgRegistrationNo: z.string().trim().max(80).nullable().optional(),
});

r.patch('/me', requireAuth, async (req, res) => {
  const b = parse(profileSchema, req.body);
  if (b.handle && (await one('SELECT 1 FROM users WHERE handle=$1 AND id<>$2', [b.handle, req.user!.id]))) {
    throw conflict('That username is taken.');
  }
  const map: Record<string, string> = {
    name: 'name', handle: 'handle', headline: 'headline', bio: 'bio', website: 'website', locationName: 'location_name',
    lat: 'lat', lng: 'lng', skills: 'skills', interests: 'interests', orgType: 'org_type', orgRegistrationNo: 'org_registration_no',
  };
  const sets: string[] = [];
  const vals: any[] = [req.user!.id];
  for (const [k, col] of Object.entries(map)) {
    if ((b as any)[k] !== undefined) {
      if (['orgType', 'orgRegistrationNo'].includes(k) && req.user!.role === 'volunteer') continue;
      vals.push((b as any)[k]);
      sets.push(`${col}=$${vals.length}`);
    }
  }
  if (!sets.length) throw badRequest('Nothing to update.');
  const u = await one(`UPDATE users SET ${sets.join(', ')}, updated_at=now() WHERE id=$1 RETURNING *`, vals);
  res.json(await selfView(u));
});

const vis = z.enum(['public', 'followers', 'private']);
r.patch('/me/privacy', requireAuth, async (req, res) => {
  const b = parse(z.object({ email: vis.optional(), phone: vis.optional(), location: vis.optional(), dob: vis.optional(), hours: vis.optional() }), req.body);
  const u = await one(`UPDATE users SET privacy = privacy || $2::jsonb, updated_at=now() WHERE id=$1 RETURNING *`, [req.user!.id, JSON.stringify(b)]);
  res.json(await selfView(u));
});

r.patch('/me/donor', requireAuth, async (req, res) => {
  const b = parse(
    z.object({
      isBloodDonor: z.boolean(),
      bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
      donorRadiusKm: z.number().int().min(1).max(200).optional(),
      lastDonationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      consent: z.boolean().optional(),
    }),
    req.body,
  );
  const cur = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  const group = b.bloodGroup !== undefined ? b.bloodGroup : decrypt(cur.blood_group_enc);
  if (b.isBloodDonor) {
    if (!group) throw badRequest('Select your blood group to opt in as a donor.', { fields: { bloodGroup: 'Required' } });
    if (!b.consent && !cur.is_blood_donor) throw badRequest('Please consent to your blood group being used only for donor matching.', { fields: { consent: 'Required' } });
    if (cur.is_minor) throw badRequest('Blood donors must be 18 or older.');
    if (!cur.lat || !cur.lng) throw badRequest('Set your location in your profile so we can match you with nearby requests.');
  }
  const u = await one(
    `UPDATE users SET is_blood_donor=$2, blood_group_enc=$3, blood_group_hash=$4, donor_radius_km=coalesce($5, donor_radius_km),
            last_donation_date = CASE WHEN $6::boolean THEN $7::date ELSE last_donation_date END, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [req.user!.id, b.isBloodDonor, encrypt(group), group ? blindIndex(group) : null, b.donorRadiusKm ?? null, b.lastDonationDate !== undefined, b.lastDonationDate ?? null],
  );
  audit(req.user!.id, 'donor.settings_updated', 'user', req.user!.id, { optedIn: b.isBloodDonor });
  res.json(await selfView(u));
});

const chan = z.object({ push: z.boolean(), email: z.boolean() });
r.patch('/me/notifications', requireAuth, async (req, res) => {
  const b = parse(z.object({ events: chan.optional(), requests: chan.optional(), social: chan.optional(), reminders: chan.optional(), radiusKm: z.number().int().min(1).max(500).optional() }), req.body);
  const u = await one(`UPDATE users SET notification_prefs = notification_prefs || $2::jsonb WHERE id=$1 RETURNING *`, [req.user!.id, JSON.stringify(b)]);
  res.json(await selfView(u));
});

r.patch('/me/leaderboard', requireAuth, async (req, res) => {
  const b = parse(z.object({ optOut: z.boolean() }), req.body);
  const u = await one('UPDATE users SET leaderboard_opt_out=$2 WHERE id=$1 RETURNING *', [req.user!.id, b.optOut]);
  res.json(await selfView(u));
});

r.post('/me/onboarding-complete', requireAuth, async (req, res) => {
  const u = await one('UPDATE users SET onboarding_completed=true WHERE id=$1 RETURNING *', [req.user!.id]);
  res.json(await selfView(u));
});

for (const kind of ['avatar', 'cover'] as const) {
  r.post(`/me/${kind}`, requireAuth, uploader({ maxMb: 5, maxFiles: 1, field: 'file' }), async (req, res) => {
    const [f] = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
    if (!f) throw badRequest('Choose an image to upload.');
    const stored = await putPublic(f.buffer, f.mime, kind === 'avatar' ? 'avatars' : 'covers');
    const u = await one(`UPDATE users SET ${kind}_url=$2, updated_at=now() WHERE id=$1 RETURNING *`, [req.user!.id, stored.url]);
    res.json(await selfView(u));
  });
}

/** Data export (right of access). */
r.get('/me/export', requireAuth, async (req, res) => {
  const id = req.user!.id;
  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  const data = {
    exportedAt: new Date().toISOString(),
    profile: await selfView(u),
    posts: await q('SELECT id, body, media, created_at FROM posts WHERE author_id=$1 AND deleted_at IS NULL', [id]),
    registrations: await q(`SELECT e.title, r.status, r.hours, r.checked_in_at, e.start_at FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.user_id=$1`, [id]),
    certificates: await q('SELECT serial, hours, issued_at FROM certificates WHERE user_id=$1', [id]),
    reviews: await q('SELECT event_id, rating, body, created_at FROM reviews WHERE reviewer_id=$1', [id]),
    pledges: await q('SELECT request_id, quantity, status, created_at FROM pledges WHERE donor_id=$1', [id]),
    bloodResponses: await q('SELECT request_id, status, created_at FROM blood_responses WHERE donor_id=$1', [id]),
    following: await q('SELECT following_id, created_at FROM follows WHERE follower_id=$1', [id]),
  };
  res.setHeader('Content-Disposition', `attachment; filename="serveconnect-data-${u.handle}.json"`);
  res.json(camel(data));
});

/** Permanently anonymises the account. */
r.post('/me/delete', requireAuth, async (req, res) => {
  const b = parse(z.object({ password: z.string().optional(), confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) }), req.body);
  const u = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (u.password_hash && !(b.password && (await bcrypt.compare(b.password, u.password_hash)))) {
    throw badRequest('Incorrect password.', { fields: { password: 'Incorrect password' } });
  }
  if (u.role === 'admin' && (await one(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND account_status='active'`))!.n <= 1) {
    throw badRequest('You are the last administrator. Promote another admin first.');
  }
  await tx(async (c) => {
    await c.query(
      `UPDATE users SET account_status='deleted', email=NULL, phone_enc=NULL, phone_hash=NULL, password_hash=NULL, google_id=NULL,
              name='Deleted user', handle=$2, avatar_url=NULL, cover_url=NULL, headline=NULL, bio=NULL, website=NULL,
              blood_group_enc=NULL, blood_group_hash=NULL, is_blood_donor=false, lat=NULL, lng=NULL, location_name=NULL,
              date_of_birth=NULL, guardian_email=NULL, two_factor_secret_enc=NULL, two_factor_enabled=false, updated_at=now()
        WHERE id=$1`,
      [u.id, `deleted_${u.id.slice(0, 8)}`],
    );
    await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [u.id]);
    await c.query('DELETE FROM push_subscriptions WHERE user_id=$1', [u.id]);
    await c.query('DELETE FROM follows WHERE follower_id=$1 OR following_id=$1', [u.id]);
    await c.query(`UPDATE event_registrations SET status='cancelled' WHERE user_id=$1 AND status IN ('registered','waitlisted')`, [u.id]);
  });
  audit(u.id, 'account.deleted', 'user', u.id, {}, ip(req));
  res.clearCookie('sc_rt', { path: '/api/auth' });
  res.json({ ok: true });
});

// ───────────────────────── CSR company membership ─────────────────────────
r.post('/me/company/join', requireAuth, async (req, res) => {
  const b = parse(z.object({ code: z.string().trim().min(4).max(20) }), req.body);
  if (req.user!.role !== 'volunteer') throw badRequest('Only volunteer accounts can join a company team.');
  const company = await one(`SELECT id, name FROM users WHERE csr_invite_code=$1 AND role='csr' AND account_status='active'`, [b.code.toUpperCase()]);
  if (!company) throw notFound('That company code was not found.');
  await q('INSERT INTO company_members (company_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [company.id, req.user!.id]);
  const u = await one('UPDATE users SET company_id=$2 WHERE id=$1 RETURNING *', [req.user!.id, company.id]);
  await notify([company.id], { type: 'csr_join', category: 'social', title: `${req.user!.name} joined your company team`, link: '/csr' });
  res.json(await selfView(u));
});
r.post('/me/company/leave', requireAuth, async (req, res) => {
  await q('DELETE FROM company_members WHERE user_id=$1', [req.user!.id]);
  const u = await one('UPDATE users SET company_id=NULL WHERE id=$1 RETURNING *', [req.user!.id]);
  res.json(await selfView(u));
});

// ───────────────────────── discovery ─────────────────────────
r.get('/search', optionalAuth, async (req, res) => {
  const b = parse(
    z.object({
      q: z.string().trim().max(80).optional(),
      role: z.enum(['volunteer', 'organizer', 'csr']).optional(),
      skill: z.string().optional(),
      verified: zBool,
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    req.query,
  );
  const where = [`u.account_status='active'`, `u.role <> 'admin'`];
  const vals: any[] = [];
  if (b.q) {
    vals.push(`%${b.q.toLowerCase()}%`);
    where.push(`(lower(u.name) LIKE $${vals.length} OR lower(u.handle::text) LIKE $${vals.length} OR lower(coalesce(u.headline,'')) LIKE $${vals.length})`);
  }
  if (b.role) { vals.push(b.role); where.push(`u.role=$${vals.length}`); }
  if (b.skill) { vals.push(b.skill); where.push(`$${vals.length} = ANY(u.skills)`); }
  if (b.verified) where.push(`u.verification_status='verified'`);
  // Minors are not discoverable in people search.
  where.push('u.is_minor = false');
  vals.push(b.limit, b.offset);
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user, u.skills, u.location_name,
            (SELECT count(*) FROM follows f WHERE f.following_id=u.id)::int AS followers
       FROM users u WHERE ${where.join(' AND ')}
      ORDER BY (u.verification_status='verified') DESC, followers DESC, u.created_at DESC
      LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );
  res.json(rows.map((x) => ({ ...x.user, skills: x.skills, locationName: x.location_name, followers: x.followers })));
});

r.get('/suggestions', requireAuth, async (req, res) => {
  const me = await one('SELECT lat, lng, interests, skills FROM users WHERE id=$1', [req.user!.id]);
  const vals: any[] = [req.user!.id];
  let distance = 'NULL';
  if (me.lat && me.lng) {
    vals.push(me.lat, me.lng);
    distance = sqlDistance('u.lat', 'u.lng', '$2', '$3');
  }
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user, ${distance} AS distance_km,
            (SELECT count(*) FROM follows f WHERE f.following_id=u.id)::int AS followers
       FROM users u
      WHERE u.id <> $1 AND u.account_status='active' AND u.role IN ('organizer','csr') AND u.is_minor=false
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id)
      ORDER BY (u.verification_status='verified') DESC, ${distance === 'NULL' ? 'followers DESC' : `distance_km ASC NULLS LAST, followers DESC`}
      LIMIT 8`,
    vals,
  );
  res.json(rows.map((x) => ({ ...x.user, followers: x.followers, distanceKm: x.distance_km ? Math.round(x.distance_km) : null })));
});

// ───────────────────────── public profile ─────────────────────────
r.get('/:idOrHandle', optionalAuth, async (req, res) => {
  const u = await findUser(String(req.params.idOrHandle));
  if (!u) throw notFound('This profile does not exist.');
  if (req.user && (await one('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [u.id, req.user.id]))) throw notFound('This profile does not exist.');
  const view: any = await publicView(u, req.user);
  if (req.user) {
    view.blocked = Boolean(await one('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, u.id]));
    view.canMessage = req.user.id !== u.id && !u.is_minor && !req.user.is_minor && !view.blocked && u.account_status === 'active';
  }
  res.json(view);
});

r.get('/:id/followers', optionalAuth, async (req, res) => {
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user FROM follows f JOIN users u ON u.id=f.follower_id
      WHERE f.following_id=$1 AND u.account_status='active' AND (u.is_minor=false OR u.id=$2 OR $3) ORDER BY f.created_at DESC LIMIT 200`,
    [req.params.id, req.user?.id ?? null, req.user?.role === 'admin'],
  );
  res.json(rows.map((x) => x.user));
});
r.get('/:id/following', optionalAuth, async (req, res) => {
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user FROM follows f JOIN users u ON u.id=f.following_id
      WHERE f.follower_id=$1 AND u.account_status='active' AND (u.is_minor=false OR u.id=$2 OR $3) ORDER BY f.created_at DESC LIMIT 200`,
    [req.params.id, req.user?.id ?? null, req.user?.role === 'admin'],
  );
  res.json(rows.map((x) => x.user));
});

r.post('/:id/follow', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw badRequest("You can't follow yourself.");
  const target = await one(`SELECT id FROM users WHERE id=$1 AND account_status='active'`, [id]);
  if (!target) throw notFound();
  if (await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [id, req.user!.id])) throw forbidden('You cannot follow this profile.');
  const ins = await q('INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [req.user!.id, id]);
  if (ins.length) {
    await notify([id], {
      type: 'follow', category: 'social', title: `${req.user!.name} started following you`, link: `/u/${req.user!.handle}`,
      dedupeKey: `follow:${req.user!.id}`, data: { userId: req.user!.id },
    });
  }
  res.json({ following: true });
});
r.delete('/:id/follow', requireAuth, async (req, res) => {
  await q('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user!.id, req.params.id]);
  res.json({ following: false });
});

r.post('/:id/block', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw badRequest("You can't block yourself.");
  await q('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.id, id]);
  await q('DELETE FROM follows WHERE (follower_id=$1 AND following_id=$2) OR (follower_id=$2 AND following_id=$1)', [req.user!.id, id]);
  res.json({ blocked: true });
});
r.delete('/:id/block', requireAuth, async (req, res) => {
  await q('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user!.id, req.params.id]);
  res.json({ blocked: false });
});

/** Volunteer: chronological attended history (REQ-PROF-3). Organizer: hosted events. */
r.get('/:id/events', optionalAuth, async (req, res) => {
  const u = await one('SELECT id, role, privacy FROM users WHERE id=$1', [req.params.id]);
  if (!u) throw notFound();
  if (u.role === 'volunteer') {
    const self = req.user?.id === u.id;
    if (!self && u.privacy?.hours === 'private' && req.user?.role !== 'admin') return res.json([]);
    const rows = await q(
      `SELECT e.id, e.title, e.category, e.start_at, e.end_at, e.location_name, e.cover_url, r.status, r.hours, r.checked_in_at,
              ${USER_CARD_SQL.replace(/u\./g, 'o.')} AS organizer
         FROM event_registrations r JOIN events e ON e.id=r.event_id JOIN users o ON o.id=e.organizer_id
        WHERE r.user_id=$1 AND (r.status='attended' OR ($2 AND r.status IN ('registered','waitlisted','no_show')))
        ORDER BY e.start_at DESC LIMIT 200`,
      [u.id, self],
    );
    return res.json(camel(rows));
  }
  const rows = await q(
    `SELECT e.id, e.title, e.category, e.status, e.start_at, e.end_at, e.location_name, e.cover_url, e.capacity,
            (SELECT count(*) FROM event_registrations r WHERE r.event_id=e.id AND r.status IN ('registered','attended'))::int AS registered,
            (SELECT round(avg(rating)::numeric,1) FROM reviews v WHERE v.event_id=e.id)::float AS rating
       FROM events e WHERE e.organizer_id=$1 AND (e.status IN ('published','completed') OR $2)
      ORDER BY e.start_at DESC LIMIT 200`,
    [u.id, req.user?.id === u.id],
  );
  res.json(camel(rows));
});

r.get('/:id/gallery', async (req, res) => {
  const rows = await q(
    `SELECT g.id, g.url, g.caption, g.created_at, e.id AS event_id, e.title AS event_title
       FROM event_gallery g JOIN events e ON e.id=g.event_id
      WHERE e.organizer_id=$1 ORDER BY g.created_at DESC LIMIT 120`,
    [req.params.id],
  );
  res.json(camel(rows));
});

r.get('/:id/reviews', async (req, res) => {
  const rows = await q(
    `SELECT v.id, v.rating, v.body, v.created_at, e.id AS event_id, e.title AS event_title, ${USER_CARD_SQL} AS reviewer
       FROM reviews v JOIN users u ON u.id=v.reviewer_id JOIN events e ON e.id=v.event_id
      WHERE v.organizer_id=$1 ORDER BY v.created_at DESC LIMIT 100`,
    [req.params.id],
  );
  res.json(camel(rows));
});

export default r;
