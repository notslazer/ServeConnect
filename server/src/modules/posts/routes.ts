/* Social layer: home feed (REQ-PROF-5), posts with photos, likes, comments, bookmarks, polls (REQ-TRUST-4). */
import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx, Db } from '../../db/pool';
import { parse, decodeCursor, encodeCursor } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { writeLimiter } from '../../middleware/rateLimit';
import { uploader, checkFiles, IMAGE_TYPES } from '../../lib/upload';
import { putPublic } from '../../lib/storage';
import { notify } from '../../lib/notify';
import { camel } from '../../lib/case';
import { USER_CARD_SQL } from '../users/serialize';

const r = Router();

// ───────────────────────── polls (shared with events) ─────────────────────────
export async function createPoll(db: Db, p: { creatorId: string; question: string; options: string[]; multi: boolean; closesAt?: string | null; eventId?: string; postId?: string }) {
  const poll = (await db.query('INSERT INTO polls (creator_id, event_id, post_id, question, multi, closes_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [
    p.creatorId, p.eventId ?? null, p.postId ?? null, p.question, p.multi, p.closesAt ?? null,
  ])).rows[0];
  for (let i = 0; i < p.options.length; i++) {
    await db.query('INSERT INTO poll_options (poll_id, label, position) VALUES ($1,$2,$3)', [poll.id, p.options[i], i]);
  }
  return poll.id as string;
}

export async function loadPolls(where: string, params: any[], viewerId?: string) {
  const polls = await q(
    `SELECT p.id, p.question, p.multi, p.closes_at, p.created_at, p.event_id, p.post_id, ${USER_CARD_SQL} AS creator,
            (SELECT count(DISTINCT user_id) FROM poll_votes v WHERE v.poll_id=p.id)::int AS voters,
            (SELECT coalesce(json_agg(json_build_object('id', o.id, 'label', o.label,
                    'votes', (SELECT count(*) FROM poll_votes v WHERE v.option_id=o.id)::int) ORDER BY o.position), '[]')
               FROM poll_options o WHERE o.poll_id=p.id) AS options,
            (SELECT coalesce(json_agg(v.option_id), '[]') FROM poll_votes v WHERE v.poll_id=p.id AND v.user_id=$${params.length + 1}) AS my_votes
       FROM polls p JOIN users u ON u.id=p.creator_id WHERE ${where} ORDER BY p.created_at DESC`,
    [...params, viewerId ?? null],
  );
  return polls.map((p) => camel({ ...p, closed: p.closes_at ? new Date(p.closes_at) < new Date() : false }));
}

const pollSchema = z.object({
  question: z.string().trim().min(3).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2, 'A poll needs at least 2 options').max(6),
  multi: z.boolean().default(false),
  closesAt: z.string().datetime().nullable().optional(),
});
export { pollSchema };

r.post('/polls/:id/vote', requireAuth, async (req, res) => {
  const b = parse(z.object({ optionIds: z.array(z.string().uuid()).min(1) }), req.body);
  const poll = await one('SELECT * FROM polls WHERE id=$1', [req.params.id]);
  if (!poll) throw notFound('Poll not found.');
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) throw badRequest('This poll has closed.');
  if (!poll.multi && b.optionIds.length > 1) throw badRequest('Choose only one option.');
  const valid = await q('SELECT id FROM poll_options WHERE poll_id=$1 AND id = ANY($2)', [poll.id, b.optionIds]);
  if (valid.length !== b.optionIds.length) throw badRequest('Invalid option.');
  await tx(async (c) => {
    await c.query('DELETE FROM poll_votes WHERE poll_id=$1 AND user_id=$2', [poll.id, req.user!.id]);
    for (const o of b.optionIds) await c.query('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1,$2,$3)', [poll.id, o, req.user!.id]);
  });
  const [out] = await loadPolls('p.id=$1', [poll.id], req.user!.id);
  res.json(out);
});

// ───────────────────────── post hydration ─────────────────────────
const POST_SELECT = (viewerParam: string) => `
  SELECT p.id, p.kind, p.body, p.media, p.created_at, p.updated_at, p.event_id, p.request_type, p.request_id,
         ${USER_CARD_SQL} AS author,
         (SELECT count(*) FROM post_likes l WHERE l.post_id=p.id)::int AS like_count,
         (SELECT count(*) FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL)::int AS comment_count,
         EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=${viewerParam}) AS liked,
         EXISTS (SELECT 1 FROM post_bookmarks b WHERE b.post_id=p.id AND b.user_id=${viewerParam}) AS bookmarked,
         (SELECT json_build_object('id', e.id, 'title', e.title, 'startAt', e.start_at, 'endAt', e.end_at, 'locationName', e.location_name,
                 'coverUrl', e.cover_url, 'category', e.category, 'status', e.status, 'capacity', e.capacity,
                 'registered', (SELECT count(*) FROM event_registrations x WHERE x.event_id=e.id AND x.status IN ('registered','attended')))
            FROM events e WHERE e.id=p.event_id) AS event,
         CASE WHEN p.request_type='resource' THEN
           (SELECT json_build_object('id', rr.id, 'type', 'resource', 'title', rr.title, 'category', rr.category, 'status', rr.status, 'coverUrl', rr.cover_url,
                   'needed', (SELECT coalesce(sum(quantity_needed),0) FROM resource_items i WHERE i.request_id=rr.id),
                   'pledged', (SELECT coalesce(sum(quantity_pledged),0) FROM resource_items i WHERE i.request_id=rr.id))
              FROM resource_requests rr WHERE rr.id=p.request_id) END AS request,
         (SELECT id FROM polls pl WHERE pl.post_id=p.id LIMIT 1) AS poll_id
    FROM posts p JOIN users u ON u.id=p.author_id`;

async function hydrate(rows: any[], viewerId?: string) {
  const pollIds = rows.map((r) => r.poll_id).filter(Boolean);
  const polls = pollIds.length ? await loadPolls('p.id = ANY($1)', [pollIds], viewerId) : [];
  const byId = new Map(polls.map((p: any) => [p.id, p]));
  return rows.map((row) => {
    const { poll_id, ...rest } = row;
    return { ...camel(rest), poll: poll_id ? byId.get(poll_id) ?? null : null };
  });
}

const pageSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(30).default(15) });

async function pageOf(where: string, params: any[], viewerId: string | undefined, query: any) {
  const b = parse(pageSchema, query);
  const cur = decodeCursor(b.cursor);
  const vals = [...params, viewerId ?? null];
  const vParam = `$${vals.length}`;
  let cond = `(${where}) AND p.deleted_at IS NULL AND u.account_status <> 'deleted'`;
  if (viewerId) cond += ` AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE bl.blocker_id=${vParam} AND bl.blocked_id=p.author_id)`;
  if (cur) {
    vals.push(cur.at, cur.id);
    cond += ` AND (p.created_at, p.id) < ($${vals.length - 1}::timestamptz, $${vals.length}::uuid)`;
  }
  vals.push(b.limit + 1);
  const rows = await q(`${POST_SELECT(vParam)} WHERE ${cond} ORDER BY p.created_at DESC, p.id DESC LIMIT $${vals.length}`, vals);
  const more = rows.length > b.limit;
  const items = rows.slice(0, b.limit);
  return { items: await hydrate(items, viewerId), nextCursor: more ? encodeCursor(items[items.length - 1]) : null };
}

// ───────────────────────── feeds ─────────────────────────
r.get('/feed', requireAuth, async (req, res) => {
  const following = await one('SELECT count(*)::int AS n FROM follows WHERE follower_id=$1', [req.user!.id]);
  if (!following!.n) {
    // New users follow nobody yet — show recent posts from verified organizers so the feed is never empty.
    const out = await pageOf(`u.verification_status='verified' OR p.author_id=$1`, [req.user!.id], req.user!.id, req.query);
    return res.json({ ...out, fallback: true });
  }
  const out = await pageOf(`(p.author_id=$1 OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id=$1))`, [req.user!.id], req.user!.id, req.query);
  res.json(out);
});

r.get('/explore', optionalAuth, async (req, res) => {
  const tag = typeof req.query.tag === 'string' ? req.query.tag.replace(/^#/, '').toLowerCase() : null;
  const qstr = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : null;
  if (tag) return res.json(await pageOf(`lower(p.body) ~ ('#' || $1 || '\\M')`, [tag], req.user?.id, req.query));
  if (qstr) return res.json(await pageOf(`lower(p.body) LIKE $1`, [`%${qstr}%`], req.user?.id, req.query));
  res.json(await pageOf(`true`, [], req.user?.id, req.query));
});

r.get('/trending-tags', async (_req, res) => {
  const rows = await q(
    `SELECT lower(m[1]) AS tag, count(*)::int AS n
       FROM posts p, regexp_matches(p.body, '#([A-Za-z0-9_]{2,40})', 'g') AS m
      WHERE p.deleted_at IS NULL AND p.created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY n DESC LIMIT 10`,
  );
  res.json(rows);
});

r.get('/user/:id', optionalAuth, async (req, res) => {
  res.json(await pageOf(`p.author_id=$1`, [req.params.id], req.user?.id, req.query));
});

r.get('/bookmarks', requireAuth, async (req, res) => {
  res.json(await pageOf(`p.id IN (SELECT post_id FROM post_bookmarks WHERE user_id=$1)`, [req.user!.id], req.user!.id, req.query));
});

r.get('/:id', optionalAuth, async (req, res) => {
  const vals = [req.params.id, req.user?.id ?? null];
  const rows = await q(`${POST_SELECT('$2')} WHERE p.id=$1 AND p.deleted_at IS NULL`, vals);
  if (!rows.length) throw notFound('This post was removed or does not exist.');
  res.json((await hydrate(rows, req.user?.id))[0]);
});

// ───────────────────────── create / edit / delete ─────────────────────────
r.post('/', requireAuth, writeLimiter, uploader({ maxMb: 8, maxFiles: 6, field: 'files' }), async (req, res) => {
  const b = parse(
    z.object({
      body: z.string().trim().max(5000).optional(),
      poll: z.string().optional(), // JSON string (multipart)
    }),
    req.body,
  );
  const files = await checkFiles(req.files as Express.Multer.File[], IMAGE_TYPES);
  let poll: z.infer<typeof pollSchema> | null = null;
  if (b.poll) {
    try {
      poll = parse(pollSchema, JSON.parse(b.poll));
    } catch (e: any) {
      throw e.status ? e : badRequest('Invalid poll.');
    }
  }
  if (!b.body && !files.length && !poll) throw badRequest('Write something, add a photo or create a poll.');
  const media: { url: string; type: string }[] = [];
  for (const f of files) media.push({ url: (await putPublic(f.buffer, f.mime, 'posts')).url, type: 'image' });
  const id = await tx(async (c) => {
    const post = (await c.query('INSERT INTO posts (author_id, body, media) VALUES ($1,$2,$3) RETURNING id', [req.user!.id, b.body ?? null, JSON.stringify(media)])).rows[0];
    if (poll) await createPoll(c, { creatorId: req.user!.id, ...poll, postId: post.id });
    return post.id;
  });
  const rows = await q(`${POST_SELECT('$2')} WHERE p.id=$1`, [id, req.user!.id]);
  res.status(201).json((await hydrate(rows, req.user!.id))[0]);
});

r.patch('/:id', requireAuth, async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);
  const p = await one('SELECT author_id FROM posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw notFound();
  if (p.author_id !== req.user!.id) throw forbidden();
  await q('UPDATE posts SET body=$2, updated_at=now() WHERE id=$1', [req.params.id, b.body]);
  const rows = await q(`${POST_SELECT('$2')} WHERE p.id=$1`, [req.params.id, req.user!.id]);
  res.json((await hydrate(rows, req.user!.id))[0]);
});

r.delete('/:id', requireAuth, async (req, res) => {
  const p = await one('SELECT author_id FROM posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw notFound();
  if (p.author_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  await q('UPDATE posts SET deleted_at=now() WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ───────────────────────── reactions ─────────────────────────
r.post('/:id/like', requireAuth, async (req, res) => {
  const p = await one('SELECT id, author_id, body FROM posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw notFound();
  const ins = await q('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [p.id, req.user!.id]);
  if (ins.length && p.author_id !== req.user!.id) {
    await notify([p.author_id], {
      type: 'like', category: 'social', title: `${req.user!.name} liked your post`,
      body: p.body?.slice(0, 80) ?? undefined, link: `/posts/${p.id}`, dedupeKey: `like:${p.id}:${req.user!.id}`,
    });
  }
  const c = await one('SELECT count(*)::int AS n FROM post_likes WHERE post_id=$1', [p.id]);
  res.json({ liked: true, likeCount: c!.n });
});
r.delete('/:id/like', requireAuth, async (req, res) => {
  await q('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  const c = await one('SELECT count(*)::int AS n FROM post_likes WHERE post_id=$1', [req.params.id]);
  res.json({ liked: false, likeCount: c!.n });
});
r.get('/:id/likes', optionalAuth, async (req, res) => {
  const rows = await q(`SELECT ${USER_CARD_SQL} AS user FROM post_likes l JOIN users u ON u.id=l.user_id WHERE l.post_id=$1 ORDER BY l.created_at DESC LIMIT 200`, [req.params.id]);
  res.json(rows.map((x) => x.user));
});
r.post('/:id/bookmark', requireAuth, async (req, res) => {
  await q('INSERT INTO post_bookmarks (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user!.id]);
  res.json({ bookmarked: true });
});
r.delete('/:id/bookmark', requireAuth, async (req, res) => {
  await q('DELETE FROM post_bookmarks WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  res.json({ bookmarked: false });
});

// ───────────────────────── comments ─────────────────────────
r.get('/:id/comments', optionalAuth, async (req, res) => {
  const rows = await q(
    `SELECT c.id, c.body, c.parent_id, c.created_at, ${USER_CARD_SQL} AS author
       FROM post_comments c JOIN users u ON u.id=c.author_id
      WHERE c.post_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at ASC LIMIT 500`,
    [req.params.id],
  );
  res.json(camel(rows));
});

r.post('/:id/comments', requireAuth, writeLimiter, async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1, 'Write a comment').max(2000), parentId: z.string().uuid().optional() }), req.body);
  const p = await one('SELECT id, author_id FROM posts WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
  if (!p) throw notFound();
  let parentAuthor: string | null = null;
  if (b.parentId) {
    const parent = await one('SELECT author_id FROM post_comments WHERE id=$1 AND post_id=$2', [b.parentId, p.id]);
    if (!parent) throw badRequest('The comment you replied to no longer exists.');
    parentAuthor = parent.author_id;
  }
  const c = await one(
    `INSERT INTO post_comments (post_id, author_id, parent_id, body) VALUES ($1,$2,$3,$4) RETURNING id, body, parent_id, created_at`,
    [p.id, req.user!.id, b.parentId ?? null, b.body],
  );
  const recipients = [p.author_id, parentAuthor].filter((x) => x && x !== req.user!.id) as string[];
  await notify(recipients, {
    type: 'comment', category: 'social', title: `${req.user!.name} ${parentAuthor ? 'replied to a comment' : 'commented on your post'}`,
    body: b.body.slice(0, 120), link: `/posts/${p.id}`,
  });
  const author = await one(`SELECT ${USER_CARD_SQL} AS a FROM users u WHERE u.id=$1`, [req.user!.id]);
  res.status(201).json(camel({ ...c, author: author!.a }));
});

r.delete('/comments/:commentId', requireAuth, async (req, res) => {
  const c = await one(`SELECT c.author_id, p.author_id AS post_author FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.id=$1`, [req.params.commentId]);
  if (!c) throw notFound();
  if (![c.author_id, c.post_author].includes(req.user!.id) && req.user!.role !== 'admin') throw forbidden();
  await q('UPDATE post_comments SET deleted_at=now() WHERE id=$1', [req.params.commentId]);
  res.json({ ok: true });
});

export default r;
