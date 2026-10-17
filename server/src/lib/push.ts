/* Web Push (VAPID) — free, works on Android/desktop browsers and iOS 16.4+ installed PWAs. */
import webpush from 'web-push';
import { env } from '../config/env';
import { q } from '../db/pool';

export const pushEnabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
if (pushEnabled) webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

export async function sendPush(userIds: string[], payload: { title: string; body?: string; link?: string; tag?: string; priority?: string }) {
  if (!pushEnabled || userIds.length === 0) return;
  const subs = await q('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)', [userIds]);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: payload.priority === 'high' ? 'high' : 'normal' },
        );
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM push_subscriptions WHERE id=$1', [s.id]);
      }
    }),
  );
}
