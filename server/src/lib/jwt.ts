import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: string;
}

export function signAccess(claims: AccessClaims) {
  return jwt.sign(claims, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl as any, issuer: 'serveconnect' });
}
export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.jwtAccessSecret, { issuer: 'serveconnect' }) as AccessClaims;
}

/** Short-lived purpose-bound tokens (2FA challenge, Google sign-up completion, etc). */
export function signPurpose(purpose: string, data: Record<string, any>, ttl: string = '10m') {
  return jwt.sign({ ...data, purpose }, env.jwtRefreshSecret, { expiresIn: ttl as any, issuer: 'serveconnect' });
}
export function verifyPurpose<T = any>(token: string, purpose: string): T {
  const decoded = jwt.verify(token, env.jwtRefreshSecret, { issuer: 'serveconnect' }) as any;
  if (decoded.purpose !== purpose) throw new Error('wrong token purpose');
  return decoded as T;
}
