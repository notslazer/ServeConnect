/* Messaging: team group chats (REQ-COORD-2) and 1:1 direct messages, delivered in real time over WebSocket (SRS §3.4). */
import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { writeLimiter } from '../../middleware/rateLimit';
import { emitToRoom, emitToUser } from '../../lib/socket';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { uploader, checkFiles, IMAGE_TYPES } from '../../lib/upload';
import { putPublic } from '../../lib/storage';
import { USER_CARD_SQL } from '../users/serialize';

const r = Router();

async function member(convId: string, userId: string) {
  const m = await one('SELECT * FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [convId, userId]);
  if (!m) throw forbidden('You are not part of this conversation.');
  return m;
}

r.get('/conversations', requireAuth, async (req, res) => {
  const rows = await q(
    `SELECT c.id, c.type, c.title, c.last_message_at, c.team_id, m.muted,
            (SELECT t.event_id FROM teams t WHERE t.id=c.team_id) AS event_id,
            (SELECT json_build_object('body', msg.body, 'senderId', msg.sender_id, 'createdAt', msg.created_at, 'hasAttachment', jsonb_array_length(msg.attachments) > 0, 'deleted', msg.deleted_at IS NOT NULL)
               FROM messages msg WHERE msg.conversation_id=c.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
            (SELECT count(*) FROM messages msg WHERE msg.conversation_id=c.id AND msg.created_at > m.last_read_at AND msg.sender_id <> $1)::int AS unread,
            (SELECT ${USER_CARD_SQL} FROM conversation_members om JOIN users u ON u.id=om.user_id
              WHERE c.type='dm' AND om.conversation_id=c.id AND om.user_id <> $1 LIMIT 1) AS other,
            (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)::int AS member_count
       FROM conversation_members m JOIN conversations c ON c.id=m.conversation_id
      WHERE m.user_id=$1
        AND (c.type='team' OR EXISTS (SELECT 1 FROM messages x WHERE x.conversation_id=c.id) OR c.created_at > now() - interval '1 day')
      ORDER BY c.last_message_at DESC LIMIT 200`,
    [req.user!.id],
  );
  res.json(camel(rows));
});

r.get('/unread-count', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT count(*)::int AS n FROM conversation_members m JOIN messages msg ON msg.conversation_id=m.conversation_id
      WHERE m.user_id=$1 AND m.muted=false AND msg.created_at > m.last_read_at AND msg.sender_id <> $1 AND msg.deleted_at IS NULL`,
    [req.user!.id],
  );
  res.json({ count: row!.n });
});

/** Get or create a direct-message conversation. Minors cannot send or receive DMs (SRS §5.2). */
r.post('/dm/:userId', requireAuth, async (req, res) => {
  const other = String(req.params.userId);
  if (other === req.user!.id) throw badRequest("You can't message yourself.");
  const target = await one(`SELECT id, is_minor, account_status FROM users WHERE id=$1`, [other]);
  if (!target || target.account_status !== 'active') throw notFound('User not found.');
  if (target.is_minor || req.user!.is_minor) throw forbidden('Direct messages are disabled for accounts under 18 for safety. Use your event team chat instead.');
  if (await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user!.id, other])) {
    throw forbidden('You cannot message this person.');
  }
  const key = [req.user!.id, other].sort().join(':');
  let conv = await one('SELECT id FROM conversations WHERE dm_key=$1', [key]);
  if (!conv) {
    conv = await one(`INSERT INTO conversations (type, dm_key) VALUES ('dm', $1) ON CONFLICT (dm_key) DO UPDATE SET dm_key=EXCLUDED.dm_key RETURNING id`, [key]);
    await q('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING', [conv!.id, req.user!.id, other]);
  }
  res.json({ id: conv!.id });
});

r.get('/conversations/:id', requireAuth, async (req, res) => {
  await member(String(req.params.id), req.user!.id);
  const c = await one(
    `SELECT c.*, (SELECT t.event_id FROM teams t WHERE t.id=c.team_id) AS event_id,
            (SELECT muted FROM conversation_members m WHERE m.conversation_id=c.id AND m.user_id=$2) AS muted,
            (SELECT coalesce(json_agg(${USER_CARD_SQL}), '[]') FROM conversation_members m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=c.id) AS members
       FROM conversations c WHERE c.id=$1`,
    [req.params.id, req.user!.id],
  );
  res.json(camel(c));
});

r.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  await member(String(req.params.id), req.user!.id);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const rows = await q(
    `SELECT msg.id, msg.conversation_id, msg.body, msg.attachments, msg.created_at, msg.edited_at, msg.deleted_at IS NOT NULL AS deleted,
            ${USER_CARD_SQL} AS sender
       FROM messages msg JOIN users u ON u.id=msg.sender_id
      WHERE msg.conversation_id=$1 AND ($2::timestamptz IS NULL OR msg.created_at < $2::timestamptz)
      ORDER BY msg.created_at DESC LIMIT 50`,
    [req.params.id, before],
  );
  const items = rows.reverse().map((m) => (m.deleted ? { ...m, body: null, attachments: [] } : m));
  res.json({ items: camel(items), hasMore: rows.length === 50 });
});

r.post('/conversations/:id/messages', requireAuth, writeLimiter, uploader({ maxMb: 8, maxFiles: 4, field: 'files' }), async (req, res) => {
  const convId = String(req.params.id);
  await member(convId, req.user!.id);
  const b = parse(z.object({ body: z.string().trim().max(4000).optional() }), req.body);
  const files = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
  if (!b.body && !files.length) throw badRequest('Message is empty.');
  const conv = await one('SELECT * FROM conversations WHERE id=$1', [convId]);
  if (conv.type === 'dm') {
    const other = await one('SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2', [convId, req.user!.id]);
    if (other && (await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user!.id, other.user_id]))) {
      throw forbidden('You cannot message this person.');
    }
  }
  const attachments: { url: string; type: string }[] = [];
  for (const f of files) attachments.push({ url: (await putPublic(f.buffer, f.mime, 'chat')).url, type: 'image' });
  const msg = await one(
    `INSERT INTO messages (conversation_id, sender_id, body, attachments) VALUES ($1,$2,$3,$4) RETURNING id, conversation_id, body, attachments, created_at`,
    [convId, req.user!.id, b.body ?? null, JSON.stringify(attachments)],
  );
  await q('UPDATE conversations SET last_message_at=now() WHERE id=$1', [convId]);
  await q('UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2', [convId, req.user!.id]);
  const sender = await one(`SELECT ${USER_CARD_SQL} AS s FROM users u WHERE u.id=$1`, [req.user!.id]);
  const payload = camel({ ...msg, deleted: false, sender: sender!.s });
  emitToRoom(`conv:${convId}`, 'message', payload);
  const members = await q('SELECT user_id, muted FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2', [convId, req.user!.id]);
  for (const m of members) emitToUser(m.user_id, 'conversation:updated', { conversationId: convId, message: payload });
  const bucket = Math.floor(Date.now() / (10 * 60_000)); // at most one alert per conversation per 10 minutes
  await notify(members.filter((m) => !m.muted).map((m) => m.user_id), {
    type: 'message', category: 'social',
    title: conv.type === 'dm' ? `New message from ${req.user!.name}` : `${req.user!.name} in ${conv.title}`,
    body: b.body?.slice(0, 120) ?? '📷 Photo', link: `/messages/${convId}`, dedupeKey: `msg:${convId}:${bucket}`,
  });
  res.status(201).json(payload);
});

r.post('/conversations/:id/read', requireAuth, async (req, res) => {
  await q('UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  emitToRoom(`conv:${req.params.id}`, 'read', { conversationId: req.params.id, userId: req.user!.id, at: new Date().toISOString() });
  res.json({ ok: true });
});

r.post('/conversations/:id/mute', requireAuth, async (req, res) => {
  const b = parse(z.object({ muted: z.boolean() }), req.body);
  await q('UPDATE conversation_members SET muted=$3 WHERE conversation_id=$1 AND user_id=$2', [req.params.id, req.user!.id, b.muted]);
  res.json({ muted: b.muted });
});

r.patch('/messages/:id', requireAuth, async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const m = await one('SELECT * FROM messages WHERE id=$1', [req.params.id]);
  if (!m || m.deleted_at) throw notFound();
  if (m.sender_id !== req.user!.id) throw forbidden();
  if (Date.now() - new Date(m.created_at).getTime() > 15 * 60_000) throw badRequest('Messages can only be edited for 15 minutes.');
  const u = await one('UPDATE messages SET body=$2, edited_at=now() WHERE id=$1 RETURNING id, conversation_id, body, edited_at', [m.id, b.body]);
  emitToRoom(`conv:${m.conversation_id}`, 'message:edited', camel(u));
  res.json(camel(u));
});

r.delete('/messages/:id', requireAuth, async (req, res) => {
  const m = await one('SELECT * FROM messages WHERE id=$1', [req.params.id]);
  if (!m) throw notFound();
  if (m.sender_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  await q('UPDATE messages SET deleted_at=now() WHERE id=$1', [m.id]);
  emitToRoom(`conv:${m.conversation_id}`, 'message:deleted', { id: m.id, conversationId: m.conversation_id });
  res.json({ ok: true });
});

export default r;
