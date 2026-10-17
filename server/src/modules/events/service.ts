/* Event business logic shared by routes and scheduled jobs. */
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { one, q, tx, Db, pool } from '../../db/pool';
import { notify } from '../../lib/notify';
import { emitToRoom } from '../../lib/socket';
import { forecastFor } from '../../lib/weather';
import { sqlDistance } from '../../lib/geo';
import { awardMilestones } from '../gamification/service';
import { randomCode } from '../../lib/crypto';

export const CHECKIN_WINDOW_SEC = 60;
export const CHECKIN_OPEN_BEFORE_MIN = 60;

// ───────────────────────── QR check-in tokens ─────────────────────────
/** Rotating token that changes every 60s so a photo of the QR code can't be reused later. */
export function checkinToken(event: { id: string; qr_secret: string }, windowOffset = 0) {
  const w = Math.floor(Date.now() / 1000 / CHECKIN_WINDOW_SEC) - windowOffset;
  return crypto.createHmac('sha256', `${env.qrSecret}:${event.qr_secret}`).update(`${event.id}:${w}`).digest('base64url').slice(0, 16);
}
export function isValidCheckinToken(event: { id: string; qr_secret: string }, token: string) {
  // Accept the current and two previous windows (≈3 minutes) to tolerate slow scans/clock drift.
  return [0, 1, 2].some((o) => {
    const t = checkinToken(event, o);
    return t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
  });
}
export function checkinUrl(eventId: string, token: string) {
  return `${env.appUrl}/checkin/${eventId}?t=${token}`;
}
export function inCheckinWindow(e: { start_at: Date; end_at: Date }) {
  const now = Date.now();
  return now >= new Date(e.start_at).getTime() - CHECKIN_OPEN_BEFORE_MIN * 60_000 && now <= new Date(e.end_at).getTime();
}

export async function uniqueCheckinCode(db: Db, eventId: string) {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(6);
    const ex = await db.query('SELECT 1 FROM event_registrations WHERE event_id=$1 AND checkin_code=$2', [eventId, code]);
    if (!ex.rowCount) return code;
  }
  return randomCode(8);
}

export function eventHours(e: { start_at: Date; end_at: Date }) {
  const h = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 3_600_000;
  return Math.max(0.5, Math.round(h * 2) / 2);
}

// ───────────────────────── capacity & waitlist ─────────────────────────
export async function counts(eventId: string, db: Db = pool) {
  const r = (await db.query(
    `SELECT count(*) FILTER (WHERE status IN ('registered','attended'))::int AS registered,
            count(*) FILTER (WHERE status='waitlisted')::int AS waitlisted,
            count(*) FILTER (WHERE status='attended')::int AS attended
       FROM event_registrations WHERE event_id=$1`,
    [eventId],
  )).rows[0];
  return r as { registered: number; waitlisted: number; attended: number };
}

/** Moves waitlisted volunteers into open spots, oldest first (REQ-EVT-2). Must run inside a transaction holding the event row lock. */
export async function promoteWaitlist(c: PoolClient, eventId: string) {
  const ev = (await c.query('SELECT id, title, capacity, status FROM events WHERE id=$1', [eventId])).rows[0];
  if (!ev || ev.status !== 'published') return [];
  const { registered } = await counts(eventId, c);
  const free = ev.capacity - registered;
  if (free <= 0) return [];
  const promoted = (await c.query(
    `UPDATE event_registrations SET status='registered', updated_at=now()
      WHERE id IN (SELECT id FROM event_registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY created_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING user_id`,
    [eventId, free],
  )).rows.map((r) => r.user_id as string);
  if (promoted.length) {
    // Notify after commit is not possible here; notify is idempotent and safe to send now.
    setImmediate(() =>
      notify(promoted, {
        type: 'waitlist_promoted', category: 'events', priority: 'high',
        title: `You're in! A spot opened up for "${ev.title}"`,
        body: 'You have been moved from the waitlist to registered. See you there!', link: `/events/${eventId}`,
        dedupeKey: `promoted:${eventId}:${Date.now()}`,
      }),
    );
  }
  return promoted;
}

export async function broadcastCounts(eventId: string) {
  emitToRoom(`event:${eventId}`, 'event:counts', { eventId, ...(await counts(eventId)) });
}

// ───────────────────────── publish → personalised notifications ─────────────────────────
export async function onEventPublished(eventId: string) {
  const e = await one('SELECT e.*, u.name AS org_name FROM events e JOIN users u ON u.id=e.organizer_id WHERE e.id=$1', [eventId]);
  if (!e) return;
  // Feed announcement visible to followers (REQ-PROF-5).
  await q(`INSERT INTO posts (author_id, kind, body, event_id) SELECT $1,'event',$2,$3 WHERE NOT EXISTS (SELECT 1 FROM posts WHERE event_id=$3 AND kind='event')`, [
    e.organizer_id, `📅 New event: ${e.title}`, e.id,
  ]);
  const followers = (await q('SELECT follower_id FROM follows WHERE following_id=$1', [e.organizer_id])).map((r) => r.follower_id);
  await notify(followers, {
    type: 'event_published', category: 'events', title: `${e.org_name} posted a new event`, body: e.title,
    link: `/events/${e.id}`, dedupeKey: `event_pub:${e.id}`,
  });
  // Personalised matches: skills or interests overlap, within each volunteer's preferred radius (REQ-ENG-2).
  const vals: any[] = [e.skills_needed ?? [], e.category, e.organizer_id];
  let geo = 'true';
  if (e.lat && e.lng) {
    vals.push(e.lat, e.lng);
    geo = `(u.lat IS NULL OR ${sqlDistance('u.lat', 'u.lng', '$4', '$5')} <= coalesce((u.notification_prefs->>'radiusKm')::int, 25))`;
  }
  const matches = await q(
    `SELECT u.id FROM users u
      WHERE u.role='volunteer' AND u.account_status='active' AND u.id <> $3
        AND (u.skills && $1::text[] OR $2 = ANY(u.interests))
        AND ${geo}
      LIMIT 5000`,
    vals,
  );
  await notify(matches.map((m) => m.id), {
    type: 'event_match', category: 'events', title: `New ${e.category.replace(/_/g, ' ')} event matches your skills`,
    body: `${e.title} · ${new Date(e.start_at).toDateString()}`, link: `/events/${e.id}`, dedupeKey: `event_pub:${e.id}`,
  });
}

// ───────────────────────── weather ─────────────────────────
export async function refreshWeather(eventId: string, force = false) {
  const e = await one('SELECT * FROM events WHERE id=$1', [eventId]);
  if (!e || !e.is_outdoor || e.lat === null || e.status !== 'published') return e?.weather ?? null;
  const start = new Date(e.start_at);
  const daysAway = (start.getTime() - Date.now()) / 86400_000;
  if (daysAway > 5 || new Date(e.end_at).getTime() < Date.now()) return e.weather; // forecast only within 5 days (REQ-EVT-4)
  if (!force && e.weather_checked_at && Date.now() - new Date(e.weather_checked_at).getTime() < 3 * 3600_000) return e.weather;
  const adv = await forecastFor(e.lat, e.lng, start, new Date(e.end_at)).catch(() => null);
  await q('UPDATE events SET weather=$2, weather_checked_at=now() WHERE id=$1', [e.id, adv ? JSON.stringify(adv) : e.weather]);
  if (adv?.adverse) {
    const users = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status IN ('registered','waitlisted')`, [e.id])).map((r) => r.user_id);
    const key = crypto.createHash('sha1').update(adv.alerts.join('|')).digest('hex').slice(0, 12);
    await notify([...users, e.organizer_id], {
      type: 'weather', category: 'reminders', priority: 'high', title: `⛈️ Weather advisory for "${e.title}"`,
      body: adv.alerts[0], link: `/events/${e.id}`, dedupeKey: `weather:${e.id}:${key}`,
    });
  }
  return adv;
}

// ───────────────────────── completion & certificates ─────────────────────────
export async function completeEvent(eventId: string) {
  const e = await tx(async (c) => {
    const ev = (await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [eventId])).rows[0];
    if (!ev || ev.status !== 'published') return null;
    const hours = eventHours(ev);
    await c.query(`UPDATE events SET status='completed', completed_at=now(), updated_at=now() WHERE id=$1`, [eventId]);
    await c.query(`UPDATE event_registrations SET status='no_show', updated_at=now() WHERE event_id=$1 AND status='registered'`, [eventId]);
    await c.query(`UPDATE event_registrations SET status='cancelled', updated_at=now() WHERE event_id=$1 AND status='waitlisted'`, [eventId]);
    await c.query(`UPDATE event_registrations SET hours=$2 WHERE event_id=$1 AND status='attended' AND hours IS NULL`, [eventId, hours]);
    return ev;
  });
  if (!e) return false;
  const attendees = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status='attended'`, [eventId])).map((r) => r.user_id);
  await notify(attendees, {
    type: 'rate_event', category: 'events', title: `How was "${e.title}"?`,
    body: 'Thank you for volunteering! Rate the event and your certificate will be ready shortly.', link: `/events/${eventId}?tab=reviews`,
    dedupeKey: `rate:${eventId}`,
  });
  await issueCertificates(eventId);
  for (const u of [...attendees, e.organizer_id]) await awardMilestones(u).catch(() => {});
  return true;
}

/** Issues a certificate for every verified attendee (REQ-COORD-5; business rule: registration alone never qualifies). */
export async function issueCertificates(eventId: string) {
  const regs = await q(
    `SELECT r.id, r.user_id, r.hours, e.title FROM event_registrations r JOIN events e ON e.id=r.event_id
      WHERE r.event_id=$1 AND r.status='attended' AND r.checked_in_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.registration_id=r.id)`,
    [eventId],
  );
  for (const r of regs) {
    const serial = `SC-${new Date().getFullYear()}-${randomCode(8)}`;
    const ins = await q(
      `INSERT INTO certificates (registration_id, user_id, event_id, serial, hours) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING serial`,
      [r.id, r.user_id, eventId, serial, r.hours ?? 1],
    );
    if (ins.length) {
      await notify([r.user_id], {
        type: 'certificate', category: 'events', title: '🎓 Your participation certificate is ready',
        body: `Certificate for "${r.title}" — ${Number(r.hours ?? 1)} verified hours.`, link: '/certificates', dedupeKey: `cert:${r.id}`,
      });
    }
  }
  await q(`UPDATE events SET certificates_issued_at=now() WHERE id=$1`, [eventId]);
  return regs.length;
}
