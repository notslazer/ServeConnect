/* Background jobs. Each job takes a Postgres advisory lock so that running several API instances
 * (horizontal scaling, SRS §5.4) never executes the same job twice concurrently. */
import cron from 'node-cron';
import { pool, q } from '../db/pool';
import { notify } from '../lib/notify';
import { completeEvent, issueCertificates, refreshWeather } from '../modules/events/service';
import { purgeVerificationDocs } from '../modules/admin/routes';

async function locked(name: string, fn: () => Promise<void>) {
  const key = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const client = await pool.connect();
  try {
    const got = (await client.query('SELECT pg_try_advisory_lock($1) AS ok', [key])).rows[0].ok;
    if (!got) return;
    try {
      await fn();
    } catch (e) {
      console.error(`[job:${name}]`, e);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}

/** REQ-EVT-3: reminders at each configured offset (default 24h and 1h) before start. */
export async function sendReminders() {
  const due = await q(
    `SELECT e.id, e.title, e.start_at, e.location_name, o.off
       FROM events e, unnest(e.reminder_offsets) AS o(off)
      WHERE e.status='published' AND e.start_at > now()
        AND e.start_at - (o.off || ' minutes')::interval <= now()
        AND e.start_at - (o.off || ' minutes')::interval > now() - interval '30 minutes'`,
  );
  for (const d of due) {
    const users = (await q(`SELECT user_id FROM event_registrations WHERE event_id=$1 AND status='registered'`, [d.id])).map((x) => x.user_id);
    const label = d.off >= 1440 ? `${Math.round(d.off / 1440)} day${d.off >= 2880 ? 's' : ''}` : d.off >= 60 ? `${Math.round(d.off / 60)} hour${d.off >= 120 ? 's' : ''}` : `${d.off} minutes`;
    await notify(users, {
      type: 'reminder', category: 'reminders', title: `⏰ "${d.title}" starts in ${label}`,
      body: `${new Date(d.start_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${d.location_name ? ' · ' + d.location_name : ''}. Remember to check in with the QR code.`,
      link: `/events/${d.id}`, dedupeKey: `remind:${d.id}:${d.off}`,
    });
  }
}

/** REQ-EVT-5: mark no-shows once the grace period after start has passed. */
export async function markNoShows() {
  await q(
    `UPDATE event_registrations r SET status='no_show', updated_at=now()
       FROM events e
      WHERE e.id=r.event_id AND e.status='published' AND r.status='registered' AND r.checked_in_at IS NULL
        AND now() > e.start_at + (e.checkin_grace_min || ' minutes')::interval`,
  );
}

/** Safety net: auto-complete events 24h after they end so certificates are never withheld. */
export async function autoComplete() {
  const rows = await q(`SELECT id, organizer_id, title FROM events WHERE status='published' AND end_at < now() - interval '24 hours'`);
  for (const e of rows) {
    if (await completeEvent(e.id)) {
      await notify([e.organizer_id], { type: 'auto_completed', category: 'events', title: `"${e.title}" was marked complete automatically`, body: 'Certificates were issued to verified attendees. Upload photos to the gallery!', link: `/events/${e.id}` });
    }
  }
}

/** REQ-COORD-5: certificates within 24h of completion (also covers late manual check-ins). */
export async function certificateSweep() {
  const rows = await q(`SELECT id FROM events WHERE status='completed' AND completed_at > now() - interval '14 days'`);
  for (const e of rows) await issueCertificates(e.id);
}

/** REQ-EVT-4: weather advisories for outdoor events within 5 days. */
export async function weatherSweep() {
  const rows = await q(`SELECT id FROM events WHERE status='published' AND is_outdoor AND lat IS NOT NULL AND start_at < now() + interval '5 days' AND end_at > now()`);
  for (const e of rows) await refreshWeather(e.id, true);
}

/** Prompt requesters to extend, close or re-broadcast expired requests. */
export async function deadlinePrompts() {
  const blood = await q(`UPDATE blood_requests SET deadline_prompted_at=now() WHERE status='open' AND needed_by < now() AND deadline_prompted_at IS NULL RETURNING id, requester_id, blood_group, hospital_name`);
  for (const b of blood) {
    await notify([b.requester_id], {
      type: 'request_deadline', category: 'requests', priority: 'high', title: `Your ${b.blood_group} request has passed its deadline`,
      body: 'Was it fulfilled? Extend the deadline, close it, or re-broadcast to donors.', link: `/requests/blood/${b.id}`, dedupeKey: `deadline:${b.id}`,
    });
  }
  const res = await q(`UPDATE resource_requests SET deadline_prompted_at=now() WHERE status='open' AND deadline IS NOT NULL AND deadline < now() AND deadline_prompted_at IS NULL RETURNING id, requester_id, title`);
  for (const r of res) {
    await notify([r.requester_id], {
      type: 'request_deadline', category: 'requests', title: `"${r.title}" has passed its deadline`,
      body: 'Extend it, mark it fulfilled, close it or re-broadcast it.', link: `/requests/resources/${r.id}`, dedupeKey: `deadline:${r.id}`,
    });
  }
}

export async function housekeeping() {
  await purgeVerificationDocs();
  await q(`DELETE FROM otp_codes WHERE created_at < now() - interval '2 days'`);
  await q(`DELETE FROM sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '60 days'`);
  await q(`DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '180 days'`);
  await q(`DELETE FROM geocode_cache WHERE created_at < now() - interval '90 days'`);
}

export function startJobs() {
  cron.schedule('* * * * *', () => locked('reminders', sendReminders));
  cron.schedule('*/5 * * * *', () => locked('noshows', markNoShows));
  cron.schedule('*/15 * * * *', () => locked('autocomplete', autoComplete));
  cron.schedule('*/10 * * * *', () => locked('certificates', certificateSweep));
  cron.schedule('0 */3 * * *', () => locked('weather', weatherSweep));
  cron.schedule('7 * * * *', () => locked('deadlines', deadlinePrompts));
  cron.schedule('30 3 * * *', () => locked('housekeeping', housekeeping));
  console.log('[jobs] scheduler started');
}
