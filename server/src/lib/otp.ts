import { one, q } from '../db/pool';
import { blindIndex, randomDigits, sha256, timingSafeEqualStr } from './crypto';
import { HttpError, badRequest } from './errors';
import { sendMail } from './mailer';
import { sendSms } from './sms';
import { templates } from '../templates/emails';
import { env } from '../config/env';

export type OtpPurpose = 'verify_email' | 'verify_phone' | 'login' | 'reset_password' | 'change_email' | 'change_phone';
const TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 45;
const MAX_ATTEMPTS = 5;

export function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}
export function maskPhone(p: string) {
  return `${p.slice(0, 3)}${'•'.repeat(Math.max(0, p.length - 5))}${p.slice(-2)}`;
}

/** Creates and sends a one-time code. Returns the code only when DEV_EXPOSE_OTP is on (local development). */
export async function issueOtp(opts: {
  target: string;
  channel: 'email' | 'sms';
  purpose: OtpPurpose;
  userId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<{ devCode?: string }> {
  const targetHash = blindIndex(opts.target);
  const recent = await one(
    `SELECT created_at FROM otp_codes WHERE target_hash=$1 AND purpose=$2 AND created_at > now() - ($3 || ' seconds')::interval ORDER BY created_at DESC LIMIT 1`,
    [targetHash, opts.purpose, RESEND_COOLDOWN_SEC],
  );
  if (recent) throw new HttpError(429, `Please wait ${RESEND_COOLDOWN_SEC} seconds before requesting another code.`, 'otp_cooldown');

  const code = randomDigits(6);
  // Invalidate older codes for the same purpose so only the newest works.
  await q(`UPDATE otp_codes SET consumed_at = now() WHERE target_hash=$1 AND purpose=$2 AND consumed_at IS NULL`, [targetHash, opts.purpose]);
  await q(
    `INSERT INTO otp_codes (user_id, target_hash, channel, purpose, code_hash, payload, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' minutes')::interval)`,
    [opts.userId ?? null, targetHash, opts.channel, opts.purpose, sha256(`${targetHash}:${code}`), opts.payload ? JSON.stringify(opts.payload) : null, TTL_MIN],
  );
  if (opts.channel === 'email') {
    await sendMail({ to: opts.target, ...templates.otpEmail(code, opts.purpose, TTL_MIN) });
  } else {
    await sendSms(opts.target, templates.otpSms(code, opts.purpose, TTL_MIN));
  }
  return env.devExposeOtp ? { devCode: code } : {};
}

/** Verifies and consumes a code. Throws a 400 with a helpful message when invalid. */
export async function consumeOtp(target: string, purpose: OtpPurpose, code: string) {
  const targetHash = blindIndex(target);
  const row = await one(
    `SELECT * FROM otp_codes WHERE target_hash=$1 AND purpose=$2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [targetHash, purpose],
  );
  if (!row || new Date(row.expires_at) < new Date()) throw badRequest('This code has expired. Request a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw badRequest('Too many incorrect attempts. Request a new code.');
  const ok = timingSafeEqualStr(row.code_hash, sha256(`${targetHash}:${String(code).trim()}`));
  if (!ok) {
    await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=$1', [row.id]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw badRequest(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.');
  }
  await q('UPDATE otp_codes SET consumed_at = now() WHERE id=$1', [row.id]);
  return row as { user_id: string | null; payload: any };
}
