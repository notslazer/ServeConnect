/* Central notification dispatcher: in-app (DB + socket), web push and email, honouring each user's
 * per-category / per-channel preferences (REQ-ENG-1). High-priority alerts always email. */
import { q } from '../db/pool';
import { emitToUser } from './socket';
import { sendPush } from './push';
import { sendMail } from './mailer';
import { templates } from '../templates/emails';

export type Category = 'events' | 'requests' | 'social' | 'reminders' | 'system';

export interface NotifyInput {
  type: string;
  category: Category;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
  /** Base key — a per-user suffix is appended. Duplicate keys are silently skipped. */
  dedupeKey?: string;
}

export async function notify(userIds: string[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const rows = await q(
    `INSERT INTO notifications (user_id, type, category, title, body, link, data, priority, dedupe_key)
     SELECT u, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::text IS NULL THEN NULL ELSE $9 || ':' || u END
     FROM unnest($1::uuid[]) AS u
     JOIN users ON users.id = u AND users.account_status <> 'deleted'
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [ids, n.type, n.category, n.title, n.body ?? null, n.link ?? null, n.data ? JSON.stringify(n.data) : null, n.priority ?? 'normal', n.dedupeKey ?? null],
  );
  if (rows.length === 0) return 0;
  const delivered = rows.map((r) => r.user_id);
  for (const r of rows) emitToUser(r.user_id, 'notification', r);

  const users = await q('SELECT id, email, email_verified, notification_prefs FROM users WHERE id = ANY($1)', [delivered]);
  const pushTo: string[] = [];
  const emailTo: string[] = [];
  for (const u of users) {
    const pref = n.category === 'system' ? { push: true, email: false } : u.notification_prefs?.[n.category] ?? { push: true, email: false };
    if (pref.push) pushTo.push(u.id);
    if (u.email && u.email_verified && (pref.email || n.priority === 'high')) emailTo.push(u.email);
  }
  sendPush(pushTo, { title: n.title, body: n.body, link: n.link, tag: n.type, priority: n.priority }).catch(() => {});
  if (emailTo.length) {
    const mail = templates.notification(n.title, n.body ?? '', n.link);
    Promise.all(emailTo.map((to) => sendMail({ to, ...mail }))).catch(() => {});
  }
  return rows.length;
}
