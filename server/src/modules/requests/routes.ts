/* Requests & donations (REQ-REQ-1..5): blood requests with compatibility + radius matching and rare-group priority,
 * and itemised resource wishlists with real-time pledge counts. */
import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../../db/pool';
import { parse, BLOOD_GROUPS, RESOURCE_CATEGORIES } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { assertVerified, optionalAuth, requireAuth } from '../../middleware/auth';
import { writeLimiter } from '../../middleware/rateLimit';
import { blindIndex, decrypt, encrypt } from '../../lib/crypto';
import { compatibleDonors, DONATION_INTERVAL_DAYS, isRare } from '../../lib/blood';
import { haversineKm, sqlDistance } from '../../lib/geo';
import { notify } from '../../lib/notify';
import { emitToRoom } from '../../lib/socket';
import { camel } from '../../lib/case';
import { uploader, checkFiles, IMAGE_TYPES } from '../../lib/upload';
import { putPublic } from '../../lib/storage';
import { normalizePhone } from '../../lib/sms';
import { USER_CARD_SQL } from '../users/serialize';
import { awardMilestones } from '../gamification/service';

const r = Router();

// ═════════════════════════ BLOOD ═════════════════════════

/** Finds opted-in, eligible, compatible donors within both the request radius and each donor's own radius. */
async function matchDonors(br: any) {
  const groups = compatibleDonors(br.blood_group).map(blindIndex);
  return q(
    `SELECT u.id FROM users u
      WHERE u.is_blood_donor AND u.account_status='active' AND u.is_minor=false AND u.id <> $1
        AND u.blood_group_hash = ANY($2) AND u.lat IS NOT NULL
        AND (u.last_donation_date IS NULL OR u.last_donation_date < now() - ($6 || ' days')::interval)
        AND ${sqlDistance('u.lat', 'u.lng', '$3', '$4')} <= LEAST($5, u.donor_radius_km)`,
    [br.requester_id, groups, br.lat, br.lng, br.radius_km, DONATION_INTERVAL_DAYS],
  );
}

async function broadcastBlood(br: any, again = false) {
  const donors = (await matchDonors(br)).map((d) => d.id);
  const high = br.is_rare || br.urgency === 'critical';
  await notify(donors, {
    type: 'blood_request', category: 'requests', priority: high ? 'high' : 'normal',
    title: `${br.is_rare ? '🚨 RARE ' : '🩸 '}${br.blood_group} blood needed${br.urgency === 'critical' ? ' — CRITICAL' : ''}`,
    body: `${br.units_needed} unit(s) at ${br.hospital_name}. Needed by ${new Date(br.needed_by).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`,
    link: `/requests/blood/${br.id}`, dedupeKey: `blood:${br.id}:${br.broadcast_count}${again ? ':re' : ''}`,
  });
  return donors.length;
}

const bloodSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),
  component: z.enum(['whole_blood', 'platelets', 'plasma', 'red_cells']).default('whole_blood'),
  unitsNeeded: z.number().int().min(1).max(50),
  patientLabel: z.string().trim().max(80).optional(),
  hospitalName: z.string().trim().min(3, 'Enter the hospital name').max(160),
  address: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  urgency: z.enum(['normal', 'urgent', 'critical']).default('urgent'),
  radiusKm: z.number().int().min(1).max(200).default(25),
  contactPhone: z.string().trim().min(6, 'Enter a contact number'),
  neededBy: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional(),
});

r.post('/blood', requireAuth, writeLimiter, async (req, res) => {
  assertVerified(req.user!, 'post blood requests');
  const b = parse(bloodSchema, req.body);
  const phone = normalizePhone(b.contactPhone);
  if (!phone) throw badRequest('Enter a valid contact number.', { fields: { contactPhone: 'Invalid phone' } });
  if (new Date(b.neededBy) < new Date()) throw badRequest('"Needed by" must be in the future.');
  const br = await one(
    `INSERT INTO blood_requests (requester_id, blood_group, component, units_needed, patient_label, hospital_name, address, lat, lng, urgency, radius_km, contact_enc, needed_by, notes, is_rare)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.user!.id, b.bloodGroup, b.component, b.unitsNeeded, b.patientLabel ?? null, b.hospitalName, b.address ?? null, b.lat, b.lng, b.urgency, b.radiusKm, encrypt(phone), b.neededBy, b.notes ?? null, isRare(b.bloodGroup)],
  );
  const matched = await broadcastBlood(br);
  res.status(201).json({ ...camel(serializeBlood(br, req.user!.id, true)), matchedDonors: matched });
});

function serializeBlood(br: any, viewerId?: string, showContact = false) {
  const { contact_enc, ...rest } = br;
  return { ...rest, contact_phone: showContact ? decrypt(contact_enc) : null, is_mine: viewerId === br.requester_id };
}

/** Business rule: blood requests are only visible to opted-in donors within the request radius (plus the requester and admins). */
r.get('/blood', requireAuth, async (req, res) => {
  const me = await one('SELECT id, role, is_blood_donor, lat, lng, blood_group_enc, donor_radius_km FROM users WHERE id=$1', [req.user!.id]);
  const status = req.query.status === 'all' ? null : 'open';
  const mine = await q(
    `SELECT b.*, ${USER_CARD_SQL} AS requester FROM blood_requests b JOIN users u ON u.id=b.requester_id
      WHERE b.requester_id=$1 ORDER BY b.created_at DESC LIMIT 50`,
    [me.id],
  );
  let nearby: any[] = [];
  const myGroup = decrypt(me.blood_group_enc);
  if (me.role === 'admin') {
    nearby = await q(`SELECT b.*, ${USER_CARD_SQL} AS requester FROM blood_requests b JOIN users u ON u.id=b.requester_id WHERE ($1::text IS NULL OR b.status=$1) ORDER BY b.created_at DESC LIMIT 100`, [status]);
  } else if (me.is_blood_donor && me.lat !== null) {
    nearby = await q(
      `SELECT b.*, ${USER_CARD_SQL} AS requester, ${sqlDistance('b.lat', 'b.lng', '$2', '$3')} AS distance_km
         FROM blood_requests b JOIN users u ON u.id=b.requester_id
        WHERE b.requester_id <> $1 AND ($4::text IS NULL OR b.status=$4) AND ${sqlDistance('b.lat', 'b.lng', '$2', '$3')} <= b.radius_km
        ORDER BY b.is_rare DESC, CASE b.urgency WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, b.needed_by ASC LIMIT 100`,
      [me.id, me.lat, me.lng, status],
    );
  }
  const mark = (b: any) => ({
    ...serializeBlood(b, me.id, b.requester_id === me.id),
    compatible: myGroup ? compatibleDonors(b.blood_group).includes(myGroup) : false,
    distance_km: b.distance_km ? Math.round(b.distance_km * 10) / 10 : null,
  });
  res.json(camel({
    mine: mine.map(mark),
    nearby: nearby.map(mark),
    donor: { optedIn: me.is_blood_donor, hasLocation: me.lat !== null, bloodGroup: myGroup },
  }));
});

async function loadBloodVisible(id: string, viewer: any) {
  const br = await one(`SELECT b.*, ${USER_CARD_SQL} AS requester FROM blood_requests b JOIN users u ON u.id=b.requester_id WHERE b.id=$1`, [id]);
  if (!br) throw notFound('Request not found.');
  if (br.requester_id === viewer.id || viewer.role === 'admin') return br;
  const me = await one('SELECT is_blood_donor, lat, lng FROM users WHERE id=$1', [viewer.id]);
  const responded = await one('SELECT 1 FROM blood_responses WHERE request_id=$1 AND donor_id=$2', [id, viewer.id]);
  if (responded) return br;
  if (!me.is_blood_donor || me.lat === null || haversineKm(me.lat, me.lng, br.lat, br.lng) > br.radius_km) {
    throw forbidden('Blood requests are only visible to opted-in donors nearby. Turn on donor mode in Settings → Blood donation.');
  }
  return br;
}

r.get('/blood/:id', requireAuth, async (req, res) => {
  const br = await loadBloodVisible(String(req.params.id), req.user!);
  const isMine = br.requester_id === req.user!.id;
  const myResp = await one('SELECT status, message, created_at FROM blood_responses WHERE request_id=$1 AND donor_id=$2', [br.id, req.user!.id]);
  let responses: any[] = [];
  if (isMine || req.user!.role === 'admin') {
    responses = await q(
      `SELECT r.id, r.status, r.message, r.created_at, ${USER_CARD_SQL} AS donor, u.phone_enc
         FROM blood_responses r JOIN users u ON u.id=r.donor_id WHERE r.request_id=$1 AND r.status <> 'cancelled' ORDER BY r.created_at`,
      [br.id],
    );
    // A donor's phone is shared with the requester only after the donor pledges (consented in the pledge dialog).
    responses = responses.map(({ phone_enc, ...x }) => ({ ...x, donorPhone: decrypt(phone_enc) }));
  }
  const me = await one('SELECT blood_group_enc, lat, lng FROM users WHERE id=$1', [req.user!.id]);
  const g = decrypt(me.blood_group_enc);
  res.json(camel({
    ...serializeBlood(br, req.user!.id, isMine || Boolean(myResp && myResp.status !== 'cancelled') || req.user!.role === 'admin'),
    my_response: myResp,
    responses,
    compatible: g ? compatibleDonors(br.blood_group).includes(g) : false,
    compatible_groups: compatibleDonors(br.blood_group),
    distance_km: me.lat !== null ? Math.round(haversineKm(me.lat, me.lng, br.lat, br.lng) * 10) / 10 : null,
  }));
});

r.post('/blood/:id/respond', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ message: z.string().trim().max(500).optional(), shareContact: z.literal(true, { errorMap: () => ({ message: 'You must agree to share your phone number with the requester' }) }) }), req.body);
  const br = await loadBloodVisible(String(req.params.id), req.user!);
  if (br.status !== 'open') throw badRequest('This request is no longer open.');
  if (br.requester_id === req.user!.id) throw badRequest("You can't respond to your own request.");
  const me = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  const g = decrypt(me.blood_group_enc);
  if (!me.is_blood_donor || !g) throw badRequest('Turn on donor mode and set your blood group first.');
  if (!compatibleDonors(br.blood_group).includes(g)) throw badRequest(`Your blood group (${g}) is not compatible with ${br.blood_group}.`);
  if (me.last_donation_date && Date.now() - new Date(me.last_donation_date).getTime() < DONATION_INTERVAL_DAYS * 86400_000) {
    throw badRequest(`Donors should wait ${DONATION_INTERVAL_DAYS} days between whole-blood donations.`);
  }
  if (!me.phone_enc) throw badRequest('Add and verify a phone number in Settings so the requester can reach you.');
  await tx(async (c) => {
    const ex = (await c.query('SELECT * FROM blood_responses WHERE request_id=$1 AND donor_id=$2 FOR UPDATE', [br.id, me.id])).rows[0];
    if (ex && ex.status !== 'cancelled') throw conflict("You've already responded to this request.");
    if (ex) await c.query(`UPDATE blood_responses SET status='pledged', message=$2, updated_at=now() WHERE id=$1`, [ex.id, b.message ?? null]);
    else await c.query('INSERT INTO blood_responses (request_id, donor_id, message) VALUES ($1,$2,$3)', [br.id, me.id, b.message ?? null]);
    await c.query('UPDATE blood_requests SET units_pledged = units_pledged + 1, updated_at=now() WHERE id=$1', [br.id]);
  });
  await notify([br.requester_id], {
    type: 'blood_response', category: 'requests', priority: 'high', title: `🩸 ${me.name} can donate ${g} blood`,
    body: b.message ?? 'Open the request to see their contact number.', link: `/requests/blood/${br.id}`,
  });
  res.json({ ok: true, contactPhone: decrypt(br.contact_enc) });
});

r.delete('/blood/:id/respond', requireAuth, async (req, res) => {
  await tx(async (c) => {
    const ex = (await c.query(`UPDATE blood_responses SET status='cancelled', updated_at=now() WHERE request_id=$1 AND donor_id=$2 AND status='pledged' RETURNING id`, [req.params.id, req.user!.id])).rows[0];
    if (!ex) throw badRequest('Nothing to cancel.');
    await c.query('UPDATE blood_requests SET units_pledged = GREATEST(units_pledged - 1, 0) WHERE id=$1', [req.params.id]);
  });
  res.json({ ok: true });
});

r.patch('/blood/:id/responses/:responseId', requireAuth, async (req, res) => {
  const b = parse(z.object({ status: z.enum(['donated', 'cancelled']) }), req.body);
  const br = await one('SELECT * FROM blood_requests WHERE id=$1', [req.params.id]);
  if (!br) throw notFound();
  if (br.requester_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  const resp = await one('SELECT * FROM blood_responses WHERE id=$1 AND request_id=$2', [req.params.responseId, br.id]);
  if (!resp) throw notFound();
  if (resp.status === b.status) return res.json({ ok: true });
  await tx(async (c) => {
    await c.query('UPDATE blood_responses SET status=$2, updated_at=now() WHERE id=$1', [resp.id, b.status]);
    if (b.status === 'donated') {
      await c.query('UPDATE blood_requests SET units_received = units_received + 1 WHERE id=$1', [br.id]);
      await c.query('UPDATE users SET last_donation_date = CURRENT_DATE WHERE id=$1', [resp.donor_id]);
    } else if (resp.status === 'pledged') {
      await c.query('UPDATE blood_requests SET units_pledged = GREATEST(units_pledged - 1, 0) WHERE id=$1', [br.id]);
    }
  });
  if (b.status === 'donated') {
    await notify([resp.donor_id], { type: 'blood_thanks', category: 'requests', title: '❤️ Thank you for donating blood!', body: 'Your donation has been confirmed by the requester.', link: `/requests/blood/${br.id}` });
    awardMilestones(resp.donor_id).catch(() => {});
  }
  res.json({ ok: true });
});

r.post('/blood/:id/status', requireAuth, async (req, res) => {
  const b = parse(z.object({ action: z.enum(['fulfilled', 'close', 'extend', 'rebroadcast', 'reopen']), neededBy: z.string().datetime({ offset: true }).optional() }), req.body);
  const br = await one('SELECT * FROM blood_requests WHERE id=$1', [req.params.id]);
  if (!br) throw notFound();
  if (br.requester_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  let out: any;
  if (b.action === 'fulfilled') out = await one(`UPDATE blood_requests SET status='fulfilled', updated_at=now() WHERE id=$1 RETURNING *`, [br.id]);
  else if (b.action === 'close') out = await one(`UPDATE blood_requests SET status='closed', updated_at=now() WHERE id=$1 RETURNING *`, [br.id]);
  else if (b.action === 'reopen') out = await one(`UPDATE blood_requests SET status='open', deadline_prompted_at=NULL, updated_at=now() WHERE id=$1 RETURNING *`, [br.id]);
  else if (b.action === 'extend') {
    if (!b.neededBy || new Date(b.neededBy) < new Date()) throw badRequest('Choose a new deadline in the future.');
    out = await one(`UPDATE blood_requests SET needed_by=$2, status='open', deadline_prompted_at=NULL, updated_at=now() WHERE id=$1 RETURNING *`, [br.id, b.neededBy]);
  } else {
    if (br.status !== 'open') throw badRequest('Re-open the request first.');
    out = await one(`UPDATE blood_requests SET broadcast_count = broadcast_count + 1, updated_at=now() WHERE id=$1 RETURNING *`, [br.id]);
    const n = await broadcastBlood(out, true);
    return res.json({ ...camel(serializeBlood(out, req.user!.id, true)), matchedDonors: n });
  }
  if (['fulfilled', 'close'].includes(b.action)) {
    const donors = (await q(`SELECT donor_id FROM blood_responses WHERE request_id=$1 AND status='pledged'`, [br.id])).map((x) => x.donor_id);
    await notify(donors, { type: 'blood_closed', category: 'requests', title: `${br.blood_group} request at ${br.hospital_name} is ${b.action === 'fulfilled' ? 'fulfilled' : 'closed'}`, body: 'Thank you for stepping up.', link: `/requests/blood/${br.id}` });
  }
  res.json(camel(serializeBlood(out, req.user!.id, true)));
});

// ═════════════════════════ RESOURCES ═════════════════════════

const itemSchema = z.object({ name: z.string().trim().min(1).max(100), unit: z.string().trim().max(30).default('units'), quantityNeeded: z.number().int().min(1).max(1_000_000) });
const resourceSchema = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(RESOURCE_CATEGORIES),
  locationName: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  items: z.array(itemSchema).min(1, 'Add at least one item to the wishlist').max(50),
});

async function loadResource(id: string, viewerId?: string) {
  const rr = await one(`SELECT rr.*, ${USER_CARD_SQL} AS requester FROM resource_requests rr JOIN users u ON u.id=rr.requester_id WHERE rr.id=$1`, [id]);
  if (!rr) throw notFound('Request not found.');
  const items = await q('SELECT * FROM resource_items WHERE request_id=$1 ORDER BY position, name', [id]);
  const myPledges = viewerId ? await q('SELECT id, item_id, quantity, status, note, created_at FROM pledges WHERE request_id=$1 AND donor_id=$2 AND status <> $3 ORDER BY created_at DESC', [id, viewerId, 'cancelled']) : [];
  const donors = await one(`SELECT count(DISTINCT donor_id)::int AS n FROM pledges WHERE request_id=$1 AND status<>'cancelled'`, [id]);
  return { ...rr, items, my_pledges: myPledges, donor_count: donors!.n, is_mine: viewerId === rr.requester_id };
}

r.post('/resources', requireAuth, writeLimiter, async (req, res) => {
  assertVerified(req.user!, 'post donation requests');
  const b = parse(resourceSchema, req.body);
  const id = await tx(async (c) => {
    const rr = (await c.query(
      `INSERT INTO resource_requests (requester_id, title, description, category, location_name, address, lat, lng, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.user!.id, b.title, b.description, b.category, b.locationName ?? null, b.address ?? null, b.lat ?? null, b.lng ?? null, b.deadline ?? null],
    )).rows[0];
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      await c.query('INSERT INTO resource_items (request_id, name, unit, quantity_needed, position) VALUES ($1,$2,$3,$4,$5)', [rr.id, it.name, it.unit, it.quantityNeeded, i]);
    }
    await c.query(`INSERT INTO posts (author_id, kind, body, request_type, request_id) VALUES ($1,'request',$2,'resource',$3)`, [req.user!.id, `🎁 Donation drive: ${b.title}`, rr.id]);
    return rr.id;
  });
  // Followers + nearby users who opted into request notifications.
  const followers = (await q('SELECT follower_id FROM follows WHERE following_id=$1', [req.user!.id])).map((x) => x.follower_id);
  let nearby: string[] = [];
  if (b.lat != null && b.lng != null) {
    nearby = (await q(
      `SELECT u.id FROM users u WHERE u.account_status='active' AND u.id<>$1 AND u.lat IS NOT NULL
         AND ${sqlDistance('u.lat', 'u.lng', '$2', '$3')} <= coalesce((u.notification_prefs->>'radiusKm')::int, 25) LIMIT 5000`,
      [req.user!.id, b.lat, b.lng],
    )).map((x) => x.id);
  }
  await notify([...followers, ...nearby], {
    type: 'resource_request', category: 'requests', title: `${req.user!.name} needs donations: ${b.title}`,
    body: b.items.slice(0, 3).map((i) => `${i.quantityNeeded} ${i.unit} ${i.name}`).join(', '), link: `/requests/resources/${id}`, dedupeKey: `res:${id}`,
  });
  res.status(201).json(camel(await loadResource(id, req.user!.id)));
});

r.post('/resources/:id/cover', requireAuth, uploader({ maxMb: 8, maxFiles: 1, field: 'file' }), async (req, res) => {
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id) throw forbidden();
  const [f] = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
  if (!f) throw badRequest('Choose an image.');
  const s = await putPublic(f.buffer, f.mime, 'requests');
  await q('UPDATE resource_requests SET cover_url=$2 WHERE id=$1', [rr.id, s.url]);
  res.json(camel(await loadResource(rr.id, req.user!.id)));
});

r.get('/resources', optionalAuth, async (req, res) => {
  const b = parse(
    z.object({
      q: z.string().max(100).optional(), category: z.string().optional(), status: z.enum(['open', 'fulfilled', 'closed', 'all']).default('open'),
      lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), radiusKm: z.coerce.number().optional(),
      requesterId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0),
    }),
    req.query,
  );
  const vals: any[] = [];
  const where = ['true'];
  if (b.status !== 'all') { vals.push(b.status); where.push(`rr.status=$${vals.length}`); }
  if (b.q) { vals.push(`%${b.q.toLowerCase()}%`); where.push(`(lower(rr.title) LIKE $${vals.length} OR lower(rr.description) LIKE $${vals.length} OR EXISTS (SELECT 1 FROM resource_items i WHERE i.request_id=rr.id AND lower(i.name) LIKE $${vals.length}))`); }
  if (b.category) { vals.push(b.category); where.push(`rr.category=$${vals.length}`); }
  if (b.requesterId) { vals.push(b.requesterId); where.push(`rr.requester_id=$${vals.length}`); }
  let dist = 'NULL::float';
  if (b.lat !== undefined && b.lng !== undefined) {
    vals.push(b.lat, b.lng);
    dist = sqlDistance('rr.lat', 'rr.lng', `$${vals.length - 1}`, `$${vals.length}`);
    if (b.radiusKm) { vals.push(b.radiusKm); where.push(`rr.lat IS NOT NULL AND ${dist} <= $${vals.length}`); }
  }
  vals.push(b.limit + 1, b.offset);
  const rows = await q(
    `SELECT rr.id, rr.title, rr.category, rr.cover_url, rr.status, rr.location_name, rr.deadline, rr.created_at, ${dist} AS distance_km,
            ${USER_CARD_SQL} AS requester,
            (SELECT coalesce(sum(quantity_needed),0) FROM resource_items i WHERE i.request_id=rr.id)::int AS needed,
            (SELECT coalesce(sum(LEAST(quantity_pledged, quantity_needed)),0) FROM resource_items i WHERE i.request_id=rr.id)::int AS pledged,
            (SELECT json_agg(json_build_object('name', i.name, 'needed', i.quantity_needed, 'pledged', i.quantity_pledged, 'unit', i.unit) ORDER BY i.position)
               FROM (SELECT * FROM resource_items WHERE request_id=rr.id ORDER BY position LIMIT 4) i) AS top_items
       FROM resource_requests rr JOIN users u ON u.id=rr.requester_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${dist === 'NULL::float' ? '' : `${dist} ASC NULLS LAST, `}rr.created_at DESC
      LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );
  res.json({ items: camel(rows.slice(0, b.limit)), hasMore: rows.length > b.limit });
});

r.get('/resources/:id', optionalAuth, async (req, res) => {
  const rr = await loadResource(String(req.params.id), req.user?.id);
  let pledges: any[] = [];
  if (rr.is_mine || req.user?.role === 'admin') {
    pledges = await q(
      `SELECT p.id, p.item_id, p.quantity, p.status, p.note, p.created_at, i.name AS item_name, i.unit, ${USER_CARD_SQL} AS donor
         FROM pledges p JOIN resource_items i ON i.id=p.item_id JOIN users u ON u.id=p.donor_id
        WHERE p.request_id=$1 AND p.status <> 'cancelled' ORDER BY p.created_at DESC`,
      [rr.id],
    );
  }
  res.json(camel({ ...rr, pledges }));
});

r.patch('/resources/:id', requireAuth, async (req, res) => {
  const b = parse(resourceSchema.partial().omit({ items: true }), req.body);
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  const map: Record<string, string> = { title: 'title', description: 'description', category: 'category', locationName: 'location_name', address: 'address', lat: 'lat', lng: 'lng', deadline: 'deadline' };
  const sets: string[] = [];
  const vals: any[] = [rr.id];
  for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) { vals.push((b as any)[k]); sets.push(`${col}=$${vals.length}`); }
  if (sets.length) await q(`UPDATE resource_requests SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, vals);
  res.json(camel(await loadResource(rr.id, req.user!.id)));
});

r.post('/resources/:id/items', requireAuth, async (req, res) => {
  const b = parse(itemSchema, req.body);
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id) throw forbidden();
  await q('INSERT INTO resource_items (request_id, name, unit, quantity_needed, position) VALUES ($1,$2,$3,$4,(SELECT coalesce(max(position),0)+1 FROM resource_items WHERE request_id=$1))', [rr.id, b.name, b.unit, b.quantityNeeded]);
  const out = await loadResource(rr.id, req.user!.id);
  emitToRoom(`request:${rr.id}`, 'wishlist:update', camel({ requestId: rr.id, items: out.items }));
  res.json(camel(out));
});

r.patch('/resources/:id/items/:itemId', requireAuth, async (req, res) => {
  const b = parse(itemSchema.partial(), req.body);
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id) throw forbidden();
  await q('UPDATE resource_items SET name=coalesce($3,name), unit=coalesce($4,unit), quantity_needed=coalesce($5,quantity_needed) WHERE id=$1 AND request_id=$2', [
    req.params.itemId, rr.id, b.name ?? null, b.unit ?? null, b.quantityNeeded ?? null,
  ]);
  const out = await loadResource(rr.id, req.user!.id);
  emitToRoom(`request:${rr.id}`, 'wishlist:update', camel({ requestId: rr.id, items: out.items }));
  res.json(camel(out));
});

r.delete('/resources/:id/items/:itemId', requireAuth, async (req, res) => {
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id) throw forbidden();
  const item = await one('SELECT quantity_pledged FROM resource_items WHERE id=$1 AND request_id=$2', [req.params.itemId, rr.id]);
  if (item?.quantity_pledged > 0) throw badRequest('This item already has pledges and cannot be removed. Edit the quantity instead.');
  await q('DELETE FROM resource_items WHERE id=$1 AND request_id=$2', [req.params.itemId, rr.id]);
  const out = await loadResource(rr.id, req.user!.id);
  emitToRoom(`request:${rr.id}`, 'wishlist:update', camel({ requestId: rr.id, items: out.items }));
  res.json(camel(out));
});

/** Pledge a specific quantity of a wishlist item (REQ-REQ-4) — counts update live for every viewer. */
r.post('/resources/:id/pledges', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1), note: z.string().trim().max(300).optional() }), req.body);
  const out = await tx(async (c) => {
    const rr = (await c.query('SELECT * FROM resource_requests WHERE id=$1', [req.params.id])).rows[0];
    if (!rr) throw notFound();
    if (rr.status !== 'open') throw badRequest('This request is no longer accepting pledges.');
    if (rr.requester_id === req.user!.id) throw badRequest("You can't pledge to your own request.");
    const item = (await c.query('SELECT * FROM resource_items WHERE id=$1 AND request_id=$2 FOR UPDATE', [b.itemId, rr.id])).rows[0];
    if (!item) throw notFound('Item not found.');
    const remaining = item.quantity_needed - item.quantity_pledged;
    if (remaining <= 0) throw conflict('This item is already fully pledged. Thank you!');
    if (b.quantity > remaining) throw badRequest(`Only ${remaining} ${item.unit} still needed.`);
    const p = (await c.query('INSERT INTO pledges (request_id, item_id, donor_id, quantity, note) VALUES ($1,$2,$3,$4,$5) RETURNING *', [rr.id, item.id, req.user!.id, b.quantity, b.note ?? null])).rows[0];
    await c.query('UPDATE resource_items SET quantity_pledged = quantity_pledged + $2 WHERE id=$1', [item.id, b.quantity]);
    return { rr, item, p };
  });
  const full = await loadResource(out.rr.id, req.user!.id);
  emitToRoom(`request:${out.rr.id}`, 'wishlist:update', camel({ requestId: out.rr.id, items: full.items }));
  await notify([out.rr.requester_id], {
    type: 'pledge', category: 'requests', title: `${req.user!.name} pledged ${b.quantity} ${out.item.unit} of ${out.item.name}`,
    body: b.note, link: `/requests/resources/${out.rr.id}`,
  });
  awardMilestones(req.user!.id).catch(() => {});
  res.status(201).json(camel(full));
});

r.delete('/pledges/:pledgeId', requireAuth, async (req, res) => {
  const out = await tx(async (c) => {
    const p = (await c.query('SELECT * FROM pledges WHERE id=$1 FOR UPDATE', [req.params.pledgeId])).rows[0];
    if (!p) throw notFound();
    if (p.donor_id !== req.user!.id) throw forbidden();
    if (p.status !== 'pledged') throw badRequest('Only open pledges can be cancelled.');
    await c.query(`UPDATE pledges SET status='cancelled', updated_at=now() WHERE id=$1`, [p.id]);
    await c.query('UPDATE resource_items SET quantity_pledged = GREATEST(quantity_pledged - $2, 0) WHERE id=$1', [p.item_id, p.quantity]);
    return p;
  });
  const full = await loadResource(out.request_id, req.user!.id);
  emitToRoom(`request:${out.request_id}`, 'wishlist:update', camel({ requestId: out.request_id, items: full.items }));
  res.json(camel(full));
});

r.patch('/pledges/:pledgeId', requireAuth, async (req, res) => {
  const b = parse(z.object({ status: z.enum(['delivered']) }), req.body);
  const p = await one('SELECT p.*, rr.requester_id FROM pledges p JOIN resource_requests rr ON rr.id=p.request_id WHERE p.id=$1', [req.params.pledgeId]);
  if (!p) throw notFound();
  if (p.requester_id !== req.user!.id) throw forbidden('Only the requester can confirm delivery.');
  if (p.status !== 'pledged') throw badRequest('Already updated.');
  await tx(async (c) => {
    await c.query(`UPDATE pledges SET status=$2, updated_at=now() WHERE id=$1`, [p.id, b.status]);
    await c.query('UPDATE resource_items SET quantity_received = quantity_received + $2 WHERE id=$1', [p.item_id, p.quantity]);
  });
  await notify([p.donor_id], { type: 'pledge_received', category: 'requests', title: '🎁 Your donation was received — thank you!', link: `/requests/resources/${p.request_id}` });
  const full = await loadResource(p.request_id, req.user!.id);
  emitToRoom(`request:${p.request_id}`, 'wishlist:update', camel({ requestId: p.request_id, items: full.items }));
  res.json({ ok: true });
});

r.post('/resources/:id/status', requireAuth, async (req, res) => {
  const b = parse(z.object({ action: z.enum(['fulfilled', 'close', 'extend', 'rebroadcast', 'reopen']), deadline: z.string().datetime({ offset: true }).optional() }), req.body);
  const rr = await one('SELECT * FROM resource_requests WHERE id=$1', [req.params.id]);
  if (!rr) throw notFound();
  if (rr.requester_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  if (b.action === 'fulfilled') await q(`UPDATE resource_requests SET status='fulfilled', updated_at=now() WHERE id=$1`, [rr.id]);
  if (b.action === 'close') await q(`UPDATE resource_requests SET status='closed', updated_at=now() WHERE id=$1`, [rr.id]);
  if (b.action === 'reopen') await q(`UPDATE resource_requests SET status='open', deadline_prompted_at=NULL, updated_at=now() WHERE id=$1`, [rr.id]);
  if (b.action === 'extend') {
    if (!b.deadline || new Date(b.deadline) < new Date()) throw badRequest('Choose a new deadline in the future.');
    await q(`UPDATE resource_requests SET deadline=$2, status='open', deadline_prompted_at=NULL, updated_at=now() WHERE id=$1`, [rr.id, b.deadline]);
  }
  if (b.action === 'rebroadcast') {
    if (rr.status !== 'open') throw badRequest('Re-open the request first.');
    const followers = (await q('SELECT follower_id FROM follows WHERE following_id=$1', [rr.requester_id])).map((x) => x.follower_id);
    await notify(followers, { type: 'resource_request', category: 'requests', title: `Still needed: ${rr.title}`, link: `/requests/resources/${rr.id}`, dedupeKey: `res:${rr.id}:${Date.now()}` });
  }
  res.json(camel(await loadResource(rr.id, req.user!.id)));
});

/** Everything I asked for or gave. */
r.get('/mine', requireAuth, async (req, res) => {
  const id = req.user!.id;
  const blood = await q('SELECT id, blood_group, units_needed, units_pledged, units_received, hospital_name, status, urgency, needed_by, created_at FROM blood_requests WHERE requester_id=$1 ORDER BY created_at DESC', [id]);
  const resources = await q(
    `SELECT rr.id, rr.title, rr.status, rr.category, rr.deadline, rr.created_at,
            (SELECT coalesce(sum(quantity_needed),0) FROM resource_items i WHERE i.request_id=rr.id)::int AS needed,
            (SELECT coalesce(sum(LEAST(quantity_pledged,quantity_needed)),0) FROM resource_items i WHERE i.request_id=rr.id)::int AS pledged
       FROM resource_requests rr WHERE rr.requester_id=$1 ORDER BY created_at DESC`,
    [id],
  );
  const pledges = await q(
    `SELECT p.id, p.quantity, p.status, p.created_at, i.name AS item_name, i.unit, rr.id AS request_id, rr.title AS request_title
       FROM pledges p JOIN resource_items i ON i.id=p.item_id JOIN resource_requests rr ON rr.id=p.request_id
      WHERE p.donor_id=$1 ORDER BY p.created_at DESC`,
    [id],
  );
  const responses = await q(
    `SELECT r.id, r.status, r.created_at, b.id AS request_id, b.blood_group, b.hospital_name, b.status AS request_status
       FROM blood_responses r JOIN blood_requests b ON b.id=r.request_id WHERE r.donor_id=$1 ORDER BY r.created_at DESC`,
    [id],
  );
  res.json(camel({ blood, resources, pledges, responses }));
});

export default r;
