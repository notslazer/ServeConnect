import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { parse } from '../../lib/validate';
import { leaderboard, computeStreak, MILESTONES } from './service';
import { one, q } from '../../db/pool';

const r = Router();

r.get('/leaderboard', requireAuth, async (req, res) => {
  const b = parse(z.object({ period: z.enum(['month', 'all']).default('month'), scope: z.enum(['global', 'following', 'nearby', 'company']).default('global') }), req.query);
  const rows = await leaderboard({ ...b, viewerId: req.user!.id });
  const me = rows.find((x) => x.id === req.user!.id) ?? null;
  const optedOut = (await one('SELECT leaderboard_opt_out FROM users WHERE id=$1', [req.user!.id]))?.leaderboard_opt_out;
  res.json({ rows, me, optedOut });
});

r.get('/progress', requireAuth, async (req, res) => {
  const earned = await q('SELECT code, awarded_at FROM user_badges WHERE user_id=$1', [req.user!.id]);
  const map = new Map(earned.map((b) => [b.code, b.awarded_at]));
  const streak = await computeStreak(req.user!.id);
  res.json({
    streak,
    milestones: MILESTONES.map(({ code, title, description, icon }) => ({ code, title, description, icon, earned: map.has(code), awardedAt: map.get(code) ?? null })),
  });
});

export default r;
