import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../../db/pool';
import { parse, decodeCursor, encodeCursor, zBool } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { camel } from '../../lib/case';
import { env } from '../../config/env';

const r = Router();

r.get('/', requireAuth, async (req, res) => {
  const b = parse(z.object({ cursor: z.string().optional(), unread: zBool, category: z.string().optional() }), req.query);
  const cur = decodeCursor(b.cursor);
  const vals: any[] = [req.user!.id];
  const where = ['user_id=$1'];
  if (b.unread) where.push('read_at IS NULL');
  if (b.category) { vals.push(b.category.split(',').map((c) => c.trim())); where.push(`category = ANY($${vals.length})`); }
  if (cur) { vals.push(cur.at, cur.id); where.push(`(created_at, id) < ($${vals.length - 1}::timestamptz, $${vals.length}::uuid)`); }
  const rows = await q(`SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 31`, vals);
  const items = rows.slice(0, 30);
  res.json({ items: camel(items), nextCursor: rows.length > 30 ? encodeCursor(items[items.length - 1]) : null });
});

r.get('/unread-count', requireAuth, async (req, res) => {
  const row = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]);
  res.json({ count: row!.n });
});

r.post('/read-all', requireAuth, async (req, res) => {
  await q('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]);
  res.json({ ok: true });
});
r.post('/:id/read', requireAuth, async (req, res) => {
  await q('UPDATE notifications SET read_at=coalesce(read_at, now()) WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  res.json({ ok: true });
});
r.delete('/:id', requireAuth, async (req, res) => {
  await q('DELETE FROM notifications WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  res.json({ ok: true });
});

// Web Push subscription management
r.get('/push/public-key', (_req, res) => res.json({ key: env.vapidPublicKey || null }));
r.post('/push/subscribe', requireAuth, async (req, res) => {
  const b = parse(z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }), req.body);
  await q(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4`,
    [req.user!.id, b.endpoint, b.keys.p256dh, b.keys.auth, String(req.headers['user-agent'] ?? '').slice(0, 300)],
  );
  res.json({ ok: true });
});
r.post('/push/unsubscribe', requireAuth, async (req, res) => {
  const b = parse(z.object({ endpoint: z.string() }), req.body);
  await q('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [b.endpoint, req.user!.id]);
  res.json({ ok: true });
});

export default r;
