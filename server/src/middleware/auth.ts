import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccess } from '../lib/jwt';
import { one, q } from '../db/pool';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  sid: string;
  role: 'volunteer' | 'organizer' | 'csr' | 'admin';
  name: string;
  handle: string;
  account_status: string;
  verification_status: string;
  is_minor: boolean;
  guardian_consent: string;
  email_verified: boolean;
  phone_verified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function load(req: Request): Promise<AuthUser | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  let claims;
  try {
    claims = verifyAccess(h.slice(7));
  } catch {
    return null;
  }
  const u = await one<AuthUser>(
    `SELECT u.id, s.id AS sid, u.role, u.name, u.handle, u.account_status, u.verification_status, u.is_minor,
            u.guardian_consent, u.email_verified, u.phone_verified
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.account_status <> 'deleted'`,
    [claims.sid, claims.sub],
  );
  if (u) {
    q(`UPDATE users SET last_active_at = now() WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes')`, [u.id]).catch(() => {});
  }
  return u;
}

/** Attaches req.user when a valid token is present; never rejects. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  req.user = (await load(req)) ?? undefined;
  next();
};

/** Requires a signed-in user. Suspended users may read but not write (SRS §5.5). */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const u = await load(req);
  if (!u) return next(unauthorized());
  if (u.account_status === 'suspended' && req.method !== 'GET') {
    return next(forbidden('Your account is suspended. You can view content but cannot make changes. Contact support to appeal.'));
  }
  req.user = u;
  next();
};

export const requireRole = (...roles: AuthUser['role'][]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

/** Business rule: only verified organizers (or admins) may publish events/requests. */
export function assertVerified(user: AuthUser, what = 'do this') {
  if (user.role === 'admin') return;
  if (user.verification_status !== 'verified') {
    throw forbidden(`Your profile must be verified to ${what}. Submit your documents under Settings → Verification.`);
  }
}

export function ip(req: Request) {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export const noop = (_req: Request, _res: Response, next: NextFunction) => next();
