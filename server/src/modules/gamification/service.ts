/* Streaks, milestones and leaderboards (REQ-ENG-3..5). Thresholds are configurable below. */
import { one, q } from '../../db/pool';
import { notify } from '../../lib/notify';
import { sqlDistance } from '../../lib/geo';
import { USER_CARD_SQL } from '../users/serialize';

interface Milestone {
  code: string;
  title: string;
  description: string;
  icon: string;
  test: (m: Metrics) => boolean;
}
interface Metrics {
  events: number;
  events90: number;
  hours: number;
  streak: number;
  donations: number;
  pledges: number;
  reviews: number;
  hosted: number;
  volunteersEngaged: number;
}

export const MILESTONES: Milestone[] = [
  { code: 'first_event', title: 'First Step', description: 'Attended your first verified event', icon: '🌱', test: (m) => m.events >= 1 },
  { code: 'committed_5_90', title: 'Committed', description: '5 verified events within 90 days', icon: '🔥', test: (m) => m.events90 >= 5 },
  { code: 'events_10', title: 'Regular', description: '10 verified events', icon: '⭐', test: (m) => m.events >= 10 },
  { code: 'events_25', title: 'Pillar of the Community', description: '25 verified events', icon: '🏛️', test: (m) => m.events >= 25 },
  { code: 'events_50', title: 'Legend', description: '50 verified events', icon: '🏆', test: (m) => m.events >= 50 },
  { code: 'hours_10', title: '10 Hours of Service', description: '10 verified service hours', icon: '⏱️', test: (m) => m.hours >= 10 },
  { code: 'hours_50', title: '50 Hours of Service', description: '50 verified service hours', icon: '⌛', test: (m) => m.hours >= 50 },
  { code: 'hours_100', title: 'Century of Service', description: '100 verified service hours', icon: '💯', test: (m) => m.hours >= 100 },
  { code: 'hours_250', title: 'Service Champion', description: '250 verified service hours', icon: '🥇', test: (m) => m.hours >= 250 },
  { code: 'streak_3', title: '3-Month Streak', description: 'Volunteered 3 months in a row', icon: '📆', test: (m) => m.streak >= 3 },
  { code: 'streak_6', title: '6-Month Streak', description: 'Volunteered 6 months in a row', icon: '🗓️', test: (m) => m.streak >= 6 },
  { code: 'streak_12', title: 'Year-Round Volunteer', description: 'Volunteered 12 months in a row', icon: '🎖️', test: (m) => m.streak >= 12 },
  { code: 'blood_donor', title: 'Lifesaver', description: 'Donated blood through a request', icon: '🩸', test: (m) => m.donations >= 1 },
  { code: 'blood_donor_5', title: 'Blood Hero', description: '5 blood donations through requests', icon: '❤️', test: (m) => m.donations >= 5 },
  { code: 'first_pledge', title: 'Giver', description: 'Pledged items to a donation drive', icon: '🎁', test: (m) => m.pledges >= 1 },
  { code: 'first_review', title: 'Voice of the Community', description: 'Reviewed an event you attended', icon: '💬', test: (m) => m.reviews >= 1 },
  { code: 'host_1', title: 'First Event Hosted', description: 'Completed your first event', icon: '📣', test: (m) => m.hosted >= 1 },
  { code: 'host_10', title: 'Seasoned Organizer', description: 'Completed 10 events', icon: '🎪', test: (m) => m.hosted >= 10 },
  { code: 'volunteers_100', title: 'Movement Builder', description: 'Engaged 100 unique volunteers', icon: '🤝', test: (m) => m.volunteersEngaged >= 100 },
];

/** Consecutive calendar months (ending this month or last month) with ≥1 verified event. */
export async function computeStreak(userId: string): Promise<{ streak: number; longest: number }> {
  const rows = await q(
    `SELECT DISTINCT to_char(date_trunc('month', e.start_at), 'YYYY-MM') AS m
       FROM event_registrations r JOIN events e ON e.id=r.event_id
      WHERE r.user_id=$1 AND r.status='attended' ORDER BY m DESC`,
    [userId],
  );
  const months = rows.map((r) => r.m as string);
  if (!months.length) return { streak: 0, longest: 0 };
  const idx = (s: string) => {
    const [y, m] = s.split('-').map(Number);
    return y * 12 + (m - 1);
  };
  const now = new Date();
  const cur = now.getFullYear() * 12 + now.getMonth();
  const set = new Set(months.map(idx));
  let streak = 0;
  let start = set.has(cur) ? cur : set.has(cur - 1) ? cur - 1 : null;
  if (start !== null) while (set.has(start - streak)) streak++;
  const sorted = [...set].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { streak, longest };
}

async function metrics(userId: string): Promise<Metrics> {
  const m = await one(
    `SELECT
       (SELECT count(*) FROM event_registrations WHERE user_id=$1 AND status='attended')::int AS events,
       (SELECT count(*) FROM event_registrations r JOIN events e ON e.id=r.event_id
          WHERE r.user_id=$1 AND r.status='attended' AND e.start_at > now() - interval '90 days')::int AS events90,
       (SELECT coalesce(sum(hours),0) FROM event_registrations WHERE user_id=$1 AND status='attended')::float AS hours,
       (SELECT count(*) FROM blood_responses WHERE donor_id=$1 AND status='donated')::int AS donations,
       (SELECT count(*) FROM pledges WHERE donor_id=$1 AND status<>'cancelled')::int AS pledges,
       (SELECT count(*) FROM reviews WHERE reviewer_id=$1)::int AS reviews,
       (SELECT count(*) FROM events WHERE organizer_id=$1 AND status='completed')::int AS hosted,
       (SELECT count(DISTINCT r.user_id) FROM event_registrations r JOIN events e ON e.id=r.event_id
          WHERE e.organizer_id=$1 AND r.status='attended')::int AS volunteers_engaged`,
    [userId],
  );
  const { streak } = await computeStreak(userId);
  return { ...m, volunteersEngaged: m.volunteers_engaged, streak } as Metrics;
}

/** Evaluates all milestones for a user and awards (and notifies) any newly reached ones. */
export async function awardMilestones(userId: string) {
  const m = await metrics(userId);
  const reached = MILESTONES.filter((x) => x.test(m));
  if (!reached.length) return [];
  const rows = await q(
    `INSERT INTO user_badges (user_id, code, title, description, icon)
     SELECT $1, c, t, d, i FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS x(c,t,d,i)
     ON CONFLICT (user_id, code) DO NOTHING RETURNING code, title, icon`,
    [userId, reached.map((x) => x.code), reached.map((x) => x.title), reached.map((x) => x.description), reached.map((x) => x.icon)],
  );
  for (const b of rows) {
    await notify([userId], {
      type: 'milestone', category: 'social', title: `${b.icon} Milestone unlocked: ${b.title}`,
      body: 'It is now shown on your profile. Share it with your followers!', link: '/me', dedupeKey: `badge:${b.code}`,
    });
  }
  return rows;
}

export async function leaderboard(opts: { period: 'month' | 'all'; scope: 'global' | 'following' | 'nearby' | 'company'; viewerId?: string; limit?: number }) {
  const vals: any[] = [];
  const where = [`r.status='attended'`, `u.account_status='active'`, `u.leaderboard_opt_out=false`, `u.role='volunteer'`];
  if (opts.period === 'month') where.push(`e.start_at >= date_trunc('month', now())`);
  if (opts.viewerId && opts.scope !== 'global') {
    // Only bind the viewer id when the SQL actually uses it; an unused $n makes Postgres reject the query.
    const bindViewer = () => { vals.push(opts.viewerId); return `$${vals.length}`; };
    if (opts.scope === 'following') { const v = bindViewer(); where.push(`(u.id = ${v} OR u.id IN (SELECT following_id FROM follows WHERE follower_id=${v}))`); }
    if (opts.scope === 'company') { const v = bindViewer(); where.push(`u.company_id = (SELECT company_id FROM users WHERE id=${v}) AND u.company_id IS NOT NULL`); }
    if (opts.scope === 'nearby') {
      const me = await one('SELECT lat, lng, notification_prefs FROM users WHERE id=$1', [opts.viewerId]);
      if (me?.lat && me?.lng) {
        vals.push(me.lat, me.lng, me.notification_prefs?.radiusKm ?? 25);
        where.push(`u.lat IS NOT NULL AND ${sqlDistance('u.lat', 'u.lng', `$${vals.length - 2}`, `$${vals.length - 1}`)} <= $${vals.length}`);
      }
    }
  }
  vals.push(opts.limit ?? 100);
  const rows = await q(
    `SELECT ${USER_CARD_SQL} AS user, sum(r.hours)::float AS hours, count(*)::int AS events,
            rank() OVER (ORDER BY sum(r.hours) DESC) AS rank
       FROM event_registrations r JOIN users u ON u.id=r.user_id JOIN events e ON e.id=r.event_id
      WHERE ${where.join(' AND ')}
      GROUP BY u.id ORDER BY hours DESC, events DESC LIMIT $${vals.length}`,
    vals,
  );
  return rows.map((x) => ({ ...x.user, hours: Math.round(x.hours * 10) / 10, events: x.events, rank: Number(x.rank) }));
}
