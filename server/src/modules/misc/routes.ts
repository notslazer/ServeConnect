import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../../db/pool';
import { parse } from '../../lib/validate';
import { geocode, reverseGeocode } from '../../lib/geo';
import { handbookPdf } from '../../lib/pdf';
import { requireAuth } from '../../middleware/auth';
import { camel } from '../../lib/case';

const r = Router();

r.get('/health', async (_req, res) => {
  const db = await one('SELECT 1 AS ok').catch(() => null);
  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', time: new Date().toISOString() });
});

r.get('/geo/search', requireAuth, async (req, res) => {
  const b = parse(z.object({ q: z.string().trim().min(3, 'Type at least 3 characters').max(200) }), req.query);
  res.json(await geocode(b.q).catch(() => []));
});
r.get('/geo/reverse', requireAuth, async (req, res) => {
  const b = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), req.query);
  res.json({ name: await reverseGeocode(b.lat, b.lng).catch(() => null) });
});

let handbookCache: Buffer | null = null;
r.get('/handbook.pdf', async (_req, res) => {
  handbookCache ??= await handbookPdf();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="ServeConnect-Organizer-Handbook.pdf"');
  res.send(handbookCache);
});

/** Public impact counters for the landing page. */
r.get('/stats/public', async (_req, res) => {
  const s = await one(`
    SELECT (SELECT count(*) FROM users WHERE role='volunteer' AND account_status='active')::int AS volunteers,
           (SELECT count(*) FROM users WHERE role IN ('organizer','csr') AND verification_status='verified')::int AS organizations,
           (SELECT count(*) FROM events WHERE status IN ('published','completed'))::int AS events,
           (SELECT coalesce(sum(hours),0) FROM event_registrations WHERE status='attended')::float AS hours,
           (SELECT count(*) FROM blood_responses WHERE status='donated')::int AS blood_donations`);
  res.json(camel(s));
});

/** Global search across people, events and requests. */
r.get('/search', requireAuth, async (req, res) => {
  const b = parse(z.object({ q: z.string().trim().min(2).max(80) }), req.query);
  const like = `%${b.q.toLowerCase()}%`;
  const people = await q(
    `SELECT id, name, handle, avatar_url, role, verification_status='verified' AS verified, headline FROM users
      WHERE account_status='active' AND role<>'admin' AND is_minor=false AND (lower(name) LIKE $1 OR lower(handle::text) LIKE $1) LIMIT 6`,
    [like],
  );
  const events = await q(
    `SELECT id, title, start_at, location_name, cover_url, category FROM events
      WHERE status='published' AND end_at > now() AND (lower(title) LIKE $1 OR lower(coalesce(location_name,'')) LIKE $1) ORDER BY start_at LIMIT 6`,
    [like],
  );
  const requests = await q(`SELECT id, title, category, status FROM resource_requests WHERE status='open' AND lower(title) LIKE $1 LIMIT 5`, [like]);
  res.json(camel({ people, events, requests }));
});

export default r;
