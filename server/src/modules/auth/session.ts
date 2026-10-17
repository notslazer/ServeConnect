import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { one, q } from '../../db/pool';
import { sha256, timingSafeEqualStr } from '../../lib/crypto';
import { signAccess } from '../../lib/jwt';
import { ip } from '../../middleware/auth';
import { sendMail } from '../../lib/mailer';
import { templates } from '../../templates/emails';
import { selfView } from '../users/serialize';

export const REFRESH_COOKIE = 'sc_rt';

function cookieOpts() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/api/auth',
    maxAge: env.refreshTokenDays * 86400_000,
  } as const;
}

function describeUA(ua: string) {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

/** Creates a session, sets the refresh cookie and returns the access token + full user. */
export async function startSession(req: Request, res: Response, userId: string) {
  const secret = crypto.randomBytes(48).toString('base64url');
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 300);
  const seenBefore = await one('SELECT 1 FROM sessions WHERE user_id=$1 AND user_agent=$2 LIMIT 1', [userId, ua]);
  const s = await one(
    `INSERT INTO sessions (user_id, refresh_hash, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval) RETURNING id`,
    [userId, sha256(secret), ua, ip(req), env.refreshTokenDays],
  );
  const user = await one('UPDATE users SET failed_login_count=0, locked_until=NULL, last_active_at=now() WHERE id=$1 RETURNING *', [userId]);
  res.cookie(REFRESH_COOKIE, `${s!.id}.${secret}`, cookieOpts());

  const priorSessions = await one('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [userId]);
  if (!seenBefore && priorSessions!.n > 1 && user.email && user.email_verified) {
    sendMail({ to: user.email, ...templates.newLoginAlert(describeUA(ua), ip(req), new Date().toUTCString()) });
  }
  return {
    accessToken: signAccess({ sub: userId, sid: s!.id, role: user.role }),
    user: await selfView(user),
  };
}

/** Rotates the refresh token. Enforces idle timeout and absolute expiry (SRS §5.3). */
export async function refreshSession(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw || !raw.includes('.')) return null;
  const [sid, secret] = raw.split('.');
  const s = await one('SELECT * FROM sessions WHERE id=$1', [sid]).catch(() => null);
  if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) return null;
  if (!timingSafeEqualStr(s.refresh_hash, sha256(secret))) {
    // Token reuse detected → likely theft. Revoke this session entirely.
    await q('UPDATE sessions SET revoked_at = now() WHERE id=$1', [sid]);
    return null;
  }
  const idleMs = Date.now() - new Date(s.last_used_at).getTime();
  if (idleMs > env.sessionIdleDays * 86400_000) {
    await q('UPDATE sessions SET revoked_at = now() WHERE id=$1', [sid]);
    return null;
  }
  const user = await one(`SELECT * FROM users WHERE id=$1 AND account_status <> 'deleted'`, [s.user_id]);
  if (!user) return null;
  const next = crypto.randomBytes(48).toString('base64url');
  await q('UPDATE sessions SET refresh_hash=$2, last_used_at=now(), ip=$3 WHERE id=$1', [sid, sha256(next), ip(req)]);
  res.cookie(REFRESH_COOKIE, `${sid}.${next}`, cookieOpts());
  return { accessToken: signAccess({ sub: user.id, sid, role: user.role }), user: await selfView(user) };
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
}

export { describeUA };
