/* Authentication & account security (REQ-PROF-1, SRS §5.3)
 *  - Email or phone + password sign-up, with OTP verification of the contact
 *  - Passwordless OTP sign-in (email or SMS)
 *  - Google Sign-In (ID token verification) with account linking
 *  - TOTP two-factor authentication with one-time backup codes
 *  - Forgot / reset password, change password, change email/phone (OTP confirmed)
 *  - Account lockout after repeated failures, rotating refresh tokens, idle-timeout sessions,
 *    session list + revoke, new-device sign-in alerts
 *  - Parent/guardian consent flow for under-18 volunteers (SRS §5.2) */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { one, q, tx } from '../../db/pool';
import { parse } from '../../lib/validate';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../../lib/errors';
import { blindIndex, decrypt, encrypt, randomCode, randomToken, sha256 } from '../../lib/crypto';
import { normalizePhone } from '../../lib/sms';
import { consumeOtp, issueOtp, maskEmail, maskPhone } from '../../lib/otp';
import { signPurpose, verifyPurpose } from '../../lib/jwt';
import { sendMail } from '../../lib/mailer';
import { templates } from '../../templates/emails';
import { requireAuth, ip } from '../../middleware/auth';
import { authLimiter, otpLimiter } from '../../middleware/rateLimit';
import { clearRefreshCookie, describeUA, refreshSession, startSession } from './session';
import { selfView } from '../users/serialize';
import { audit } from '../admin/audit';
import { notify } from '../../lib/notify';

const r = Router();
const google = new OAuth2Client();
authenticator.options = { window: 1 };

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const MIN_AGE = 13;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

// ───────────────────────── helpers ─────────────────────────
const zPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

type Ident = { kind: 'email'; value: string } | { kind: 'phone'; value: string } | { kind: 'handle'; value: string };

function parseIdentifier(raw: string): Ident {
  const s = raw.trim();
  if (s.includes('@')) return { kind: 'email', value: s.toLowerCase() };
  if (/^[+\d][\d\s()-]{6,}$/.test(s)) {
    const p = normalizePhone(s);
    if (!p) throw badRequest('That phone number does not look valid.');
    return { kind: 'phone', value: p };
  }
  return { kind: 'handle', value: s.replace(/^@/, '') };
}

async function findByIdent(id: Ident) {
  if (id.kind === 'email') return one(`SELECT * FROM users WHERE email=$1 AND account_status<>'deleted'`, [id.value]);
  if (id.kind === 'phone') return one(`SELECT * FROM users WHERE phone_hash=$1 AND account_status<>'deleted'`, [blindIndex(id.value)]);
  return one(`SELECT * FROM users WHERE handle=$1 AND account_status<>'deleted'`, [id.value]);
}

function ageFrom(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

async function uniqueHandle(name: string) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'user';
  for (let i = 0; i < 20; i++) {
    const h = i === 0 ? base : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!(await one('SELECT 1 FROM users WHERE handle=$1', [h]))) return h;
  }
  return `${base}${Date.now().toString(36)}`;
}

async function sendGuardianRequest(user: any, guardianName?: string) {
  const token = randomToken(32);
  await q(`INSERT INTO guardian_consents (user_id, token_hash, guardian_email, guardian_name, expires_at) VALUES ($1,$2,$3,$4, now() + interval '14 days')`, [
    user.id, sha256(token), user.guardian_email, guardianName ?? null,
  ]);
  const link = `${env.appUrl}/guardian-consent/${token}`;
  await sendMail({ to: user.guardian_email, ...templates.guardianConsent(user.name, link, guardianName) });
  return env.devExposeOtp ? { devGuardianLink: link } : {};
}

/** After password/OTP/Google succeed: either start a session, or demand the 2FA code. */
async function completeLogin(req: any, res: any, user: any) {
  if (user.account_status === 'deleted') throw unauthorized('This account no longer exists.');
  if (user.two_factor_enabled) {
    return res.json({ mfaRequired: true, mfaToken: signPurpose('mfa', { uid: user.id }, '5m') });
  }
  const out = await startSession(req, res, user.id);
  audit(user.id, 'auth.login', 'user', user.id, { method: req.path }, ip(req));
  res.json(out);
}

async function registerFailure(user: any) {
  const n = user.failed_login_count + 1;
  if (n >= MAX_FAILED) {
    await q(`UPDATE users SET failed_login_count=0, locked_until = now() + ($2 || ' minutes')::interval WHERE id=$1`, [user.id, LOCK_MINUTES]);
    audit(user.id, 'auth.locked', 'user', user.id);
  } else {
    await q('UPDATE users SET failed_login_count=$2 WHERE id=$1', [user.id, n]);
  }
  return MAX_FAILED - n;
}

function assertNotLocked(user: any) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Too many failed attempts. Your account is locked for ${mins} more minute${mins === 1 ? '' : 's'}, or reset your password.`, 'locked');
  }
}

// ───────────────────────── public config ─────────────────────────
r.get('/config', (_req, res) => {
  res.json({
    appName: env.appName,
    googleClientId: env.googleClientId || null,
    vapidPublicKey: env.vapidPublicKey || null,
    smsEnabled: env.sms.provider !== 'console',
    emailEnabled: Boolean(env.smtp.host),
    devMode: env.devExposeOtp,
  });
});

// ───────────────────────── registration ─────────────────────────
const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your full name').max(80),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
    password: zPassword.optional().or(z.literal('').transform(() => undefined)),
    role: z.enum(['volunteer', 'organizer', 'csr']),
    orgType: z.enum(['ngo', 'independent', 'company']).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth').optional(),
    guardianEmail: z.string().trim().toLowerCase().email('Enter a valid guardian email').optional().or(z.literal('').transform(() => undefined)),
    guardianName: z.string().trim().max(80).optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }) }),
  })
  .refine((d) => d.email || d.phone, { message: 'Enter an email address or phone number', path: ['email'] })
  .refine((d) => d.role !== 'volunteer' || d.dateOfBirth, { message: 'Date of birth is required for volunteers', path: ['dateOfBirth'] });

r.post('/register', authLimiter, async (req, res) => {
  const b = parse(registerSchema, req.body);
  const phone = b.phone ? normalizePhone(b.phone) : null;
  if (b.phone && !phone) throw badRequest('That phone number does not look valid.', { fields: { phone: 'Invalid phone number' } });

  let isMinor = false;
  if (b.dateOfBirth) {
    const age = ageFrom(b.dateOfBirth);
    if (age < MIN_AGE) throw badRequest(`You must be at least ${MIN_AGE} years old to use ${env.appName}.`, { fields: { dateOfBirth: `Minimum age is ${MIN_AGE}` } });
    if (age > 120) throw badRequest('Please check your date of birth.', { fields: { dateOfBirth: 'Invalid date' } });
    isMinor = age < 18;
  }
  if (isMinor && b.role !== 'volunteer') throw badRequest('Organizer and company accounts must be run by adults (18+).');
  if (isMinor && !b.guardianEmail) throw badRequest('Volunteers under 18 must provide a parent or guardian email.', { fields: { guardianEmail: 'Required for under-18 volunteers' } });
  if (b.guardianEmail && b.guardianEmail === b.email) throw badRequest('Guardian email must be different from your own.', { fields: { guardianEmail: 'Must differ from your email' } });

  if (b.email) {
    const ex = await one('SELECT id, email_verified FROM users WHERE email=$1', [b.email]);
    if (ex?.email_verified) throw conflict('An account with this email already exists. Try signing in instead.', 'email_taken');
    if (ex) await q(`DELETE FROM users WHERE id=$1 AND email_verified=false AND phone_verified=false`, [ex.id]); // abandoned sign-up
  }
  if (phone) {
    const ex = await one('SELECT id, phone_verified FROM users WHERE phone_hash=$1', [blindIndex(phone)]);
    if (ex?.phone_verified) throw conflict('An account with this phone number already exists. Try signing in instead.', 'phone_taken');
    if (ex) await q(`DELETE FROM users WHERE id=$1 AND email_verified=false AND phone_verified=false`, [ex.id]);
  }

  const user = await one(
    `INSERT INTO users (name, handle, email, phone_enc, phone_hash, password_hash, role, org_type, date_of_birth, is_minor,
                        guardian_email, guardian_consent, terms_accepted_at, csr_invite_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), $13) RETURNING *`,
    [
      b.name, await uniqueHandle(b.name), b.email ?? null, encrypt(phone), phone ? blindIndex(phone) : null,
      b.password ? await bcrypt.hash(b.password, 12) : null, b.role,
      b.role === 'volunteer' ? null : b.orgType ?? (b.role === 'csr' ? 'company' : 'ngo'),
      b.dateOfBirth ?? null, isMinor, b.guardianEmail ?? null, isMinor ? 'pending' : 'not_required',
      b.role === 'csr' ? randomCode(8) : null,
    ],
  );
  const channel = b.email ? 'email' : 'sms';
  const target = b.email ?? phone!;
  const otp = await issueOtp({ target, channel, purpose: channel === 'email' ? 'verify_email' : 'verify_phone', userId: user.id });
  let guardian = {};
  if (isMinor) guardian = await sendGuardianRequest(user, b.guardianName);
  audit(user.id, 'auth.register', 'user', user.id, { role: b.role }, ip(req));
  res.status(201).json({
    userId: user.id,
    verify: { channel, identifier: target, destination: channel === 'email' ? maskEmail(target) : maskPhone(target) },
    ...otp,
    ...guardian,
  });
});

const verifySchema = z.object({ identifier: z.string().min(3), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });

/** Confirms the email/phone used at sign-up, then signs the user in. */
r.post('/verify', authLimiter, async (req, res) => {
  const b = parse(verifySchema, req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter the email or phone number the code was sent to.');
  const purpose = id.kind === 'email' ? 'verify_email' : 'verify_phone';
  const user = await findByIdent(id);
  if (!user) throw notFound('No pending sign-up found for that email or phone.');
  await consumeOtp(id.value, purpose, b.code);
  const first = !user.email_verified && !user.phone_verified;
  await q(`UPDATE users SET ${id.kind === 'email' ? 'email_verified' : 'phone_verified'} = true, updated_at=now() WHERE id=$1`, [user.id]);
  if (first && user.email && id.kind === 'email') sendMail({ to: user.email, ...templates.welcome(user.name) });
  await completeLogin(req, res, { ...user, two_factor_enabled: false });
});

r.post('/resend', otpLimiter, async (req, res) => {
  const b = parse(z.object({ identifier: z.string().min(3), purpose: z.enum(['verify_email', 'verify_phone', 'login', 'reset_password']) }), req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter an email or phone number.');
  const user = await findByIdent(id);
  // Do not reveal whether an account exists.
  if (!user) return res.json({ sent: true });
  const out = await issueOtp({ target: id.value, channel: id.kind === 'email' ? 'email' : 'sms', purpose: b.purpose, userId: user.id });
  res.json({ sent: true, ...out });
});

// ───────────────────────── password login ─────────────────────────
r.post('/login', authLimiter, async (req, res) => {
  const b = parse(z.object({ identifier: z.string().min(2, 'Enter your email, phone or username'), password: z.string().min(1, 'Enter your password') }), req.body);
  const id = parseIdentifier(b.identifier);
  const user = await findByIdent(id);
  if (!user) {
    await bcrypt.compare(b.password, DUMMY_HASH); // equalise timing so attackers can't detect valid accounts
    throw unauthorized('Incorrect email/phone or password.');
  }
  assertNotLocked(user);
  if (!user.password_hash) {
    throw new HttpError(400, user.google_id ? 'This account uses Google Sign-In or a one-time code. Use one of those options, or set a password via "Forgot password".' : 'This account has no password. Sign in with a one-time code instead.', 'no_password');
  }
  if (!(await bcrypt.compare(b.password, user.password_hash))) {
    const left = await registerFailure(user);
    throw unauthorized(left > 0 ? `Incorrect email/phone or password. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lock.` : `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`);
  }
  if (!user.email_verified && !user.phone_verified) {
    const target = user.email ?? decrypt(user.phone_enc)!;
    const channel = user.email ? 'email' : 'sms';
    const out = await issueOtp({ target, channel, purpose: channel === 'email' ? 'verify_email' : 'verify_phone', userId: user.id }).catch(() => ({}));
    return res.status(403).json({
      error: { code: 'unverified', message: 'Please verify your account first. We just sent you a new code.' },
      verify: { channel, identifier: target, destination: channel === 'email' ? maskEmail(target) : maskPhone(target) },
      ...out,
    });
  }
  await completeLogin(req, res, user);
});

// ───────────────────────── passwordless OTP login ─────────────────────────
r.post('/otp/request', otpLimiter, async (req, res) => {
  const b = parse(z.object({ identifier: z.string().min(3, 'Enter your email or phone number') }), req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter your email address or phone number to receive a code.');
  const user = await findByIdent(id);
  const destination = id.kind === 'email' ? maskEmail(id.value) : maskPhone(id.value);
  if (!user) return res.json({ sent: true, destination }); // no account enumeration
  assertNotLocked(user);
  const out = await issueOtp({ target: id.value, channel: id.kind === 'email' ? 'email' : 'sms', purpose: 'login', userId: user.id });
  res.json({ sent: true, destination, ...out });
});

r.post('/otp/verify', authLimiter, async (req, res) => {
  const b = parse(verifySchema, req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter the email or phone number the code was sent to.');
  const user = await findByIdent(id);
  if (!user) throw badRequest('This code has expired. Request a new one.');
  assertNotLocked(user);
  try {
    await consumeOtp(id.value, 'login', b.code);
  } catch (e) {
    await registerFailure(user);
    throw e;
  }
  // Receiving the code proves ownership of that contact.
  await q(`UPDATE users SET ${id.kind === 'email' ? 'email_verified' : 'phone_verified'} = true WHERE id=$1`, [user.id]);
  await completeLogin(req, res, user);
});

// ───────────────────────── Google Sign-In ─────────────────────────
async function verifyGoogle(credential: string) {
  if (!env.googleClientId) throw badRequest('Google Sign-In is not configured on this server.');
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) throw new Error('unverified');
    return { googleId: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email.split('@')[0], picture: p.picture ?? null };
  } catch {
    throw unauthorized('Google sign-in failed. Please try again.');
  }
}

r.post('/google', authLimiter, async (req, res) => {
  const b = parse(z.object({ credential: z.string().min(20) }), req.body);
  const g = await verifyGoogle(b.credential);
  let user = await one(`SELECT * FROM users WHERE google_id=$1 AND account_status<>'deleted'`, [g.googleId]);
  if (!user) {
    const byEmail = await one(`SELECT * FROM users WHERE email=$1 AND account_status<>'deleted'`, [g.email]);
    if (byEmail) {
      // Link Google to the existing account — Google has verified the same email.
      user = await one(`UPDATE users SET google_id=$2, email_verified=true, avatar_url=coalesce(avatar_url,$3) WHERE id=$1 RETURNING *`, [byEmail.id, g.googleId, g.picture]);
      audit(user.id, 'auth.google_linked', 'user', user.id);
    }
  }
  if (user) {
    assertNotLocked(user);
    return completeLogin(req, res, user);
  }
  // New user — collect role / date of birth / terms before creating the account.
  res.json({ needsProfile: true, googleToken: signPurpose('google_signup', g, '15m'), name: g.name, email: g.email, picture: g.picture });
});

r.post('/google/complete', authLimiter, async (req, res) => {
  const b = parse(
    z.object({
      googleToken: z.string(),
      role: z.enum(['volunteer', 'organizer', 'csr']),
      orgType: z.enum(['ngo', 'independent', 'company']).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      guardianEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),
      guardianName: z.string().max(80).optional(),
      acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }) }),
    }),
    req.body,
  );
  let g: any;
  try {
    g = verifyPurpose(b.googleToken, 'google_signup');
  } catch {
    throw unauthorized('Your Google sign-up session expired. Please try again.');
  }
  if (b.role === 'volunteer' && !b.dateOfBirth) throw badRequest('Date of birth is required for volunteers', { fields: { dateOfBirth: 'Required' } });
  let isMinor = false;
  if (b.dateOfBirth) {
    const age = ageFrom(b.dateOfBirth);
    if (age < MIN_AGE) throw badRequest(`You must be at least ${MIN_AGE} years old.`);
    isMinor = age < 18;
  }
  if (isMinor && b.role !== 'volunteer') throw badRequest('Organizer and company accounts must be run by adults (18+).');
  if (isMinor && !b.guardianEmail) throw badRequest('Volunteers under 18 must provide a parent or guardian email.', { fields: { guardianEmail: 'Required' } });
  if (await one('SELECT 1 FROM users WHERE google_id=$1 OR email=$2', [g.googleId, g.email])) throw conflict('Account already exists — please sign in.');
  const user = await one(
    `INSERT INTO users (name, handle, email, email_verified, google_id, avatar_url, role, org_type, date_of_birth, is_minor,
                        guardian_email, guardian_consent, terms_accepted_at, csr_invite_code)
     VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12) RETURNING *`,
    [
      g.name, await uniqueHandle(g.name), g.email, g.googleId, g.picture, b.role,
      b.role === 'volunteer' ? null : b.orgType ?? (b.role === 'csr' ? 'company' : 'ngo'),
      b.dateOfBirth ?? null, isMinor, b.guardianEmail ?? null, isMinor ? 'pending' : 'not_required',
      b.role === 'csr' ? randomCode(8) : null,
    ],
  );
  if (isMinor) await sendGuardianRequest(user, b.guardianName);
  sendMail({ to: g.email, ...templates.welcome(user.name) });
  audit(user.id, 'auth.register', 'user', user.id, { role: b.role, via: 'google' }, ip(req));
  const out = await startSession(req, res, user.id);
  res.status(201).json(out);
});

// ───────────────────────── 2FA challenge ─────────────────────────
async function checkSecondFactor(user: any, code: string): Promise<boolean> {
  const clean = code.replace(/\s|-/g, '');
  const secret = decrypt(user.two_factor_secret_enc);
  if (secret && /^\d{6}$/.test(clean) && authenticator.check(clean, secret)) return true;
  const h = sha256(clean.toUpperCase());
  if (user.two_factor_backup?.includes(h)) {
    await q('UPDATE users SET two_factor_backup = array_remove(two_factor_backup, $2) WHERE id=$1', [user.id, h]);
    return true;
  }
  return false;
}

r.post('/2fa/verify', authLimiter, async (req, res) => {
  const b = parse(z.object({ mfaToken: z.string(), code: z.string().min(6).max(20) }), req.body);
  let uid: string;
  try {
    uid = verifyPurpose<{ uid: string }>(b.mfaToken, 'mfa').uid;
  } catch {
    throw unauthorized('Your sign-in attempt expired. Please start again.');
  }
  const user = await one('SELECT * FROM users WHERE id=$1', [uid]);
  if (!user) throw unauthorized();
  assertNotLocked(user);
  if (!(await checkSecondFactor(user, b.code))) {
    const left = await registerFailure(user);
    throw unauthorized(left > 0 ? 'Incorrect authentication code.' : `Too many failed attempts. Locked for ${LOCK_MINUTES} minutes.`);
  }
  const out = await startSession(req, res, user.id);
  audit(user.id, 'auth.login', 'user', user.id, { method: '2fa' }, ip(req));
  res.json(out);
});

// ───────────────────────── sessions ─────────────────────────
r.post('/refresh', async (req, res) => {
  const out = await refreshSession(req, res);
  if (!out) {
    clearRefreshCookie(res);
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  res.json(out);
});

r.post('/logout', async (req, res) => {
  const raw = req.cookies?.sc_rt as string | undefined;
  if (raw?.includes('.')) await q('UPDATE sessions SET revoked_at=now() WHERE id=$1', [raw.split('.')[0]]).catch(() => {});
  clearRefreshCookie(res);
  res.json({ ok: true });
});

r.get('/sessions', requireAuth, async (req, res) => {
  const rows = await q(
    `SELECT id, user_agent, ip, created_at, last_used_at, expires_at FROM sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC`,
    [req.user!.id],
  );
  res.json(rows.map((s) => ({
    id: s.id, device: describeUA(s.user_agent ?? ''), userAgent: s.user_agent, ip: s.ip,
    createdAt: s.created_at, lastUsedAt: s.last_used_at, current: s.id === req.user!.sid,
  })));
});

r.delete('/sessions/:id', requireAuth, async (req, res) => {
  await q('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
  audit(req.user!.id, 'auth.session_revoked', 'session', String(req.params.id));
  res.json({ ok: true });
});

r.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  const out = await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL RETURNING id', [req.user!.id, req.user!.sid]);
  res.json({ revoked: out.length });
});

// ───────────────────────── password reset / change ─────────────────────────
r.post('/forgot', otpLimiter, async (req, res) => {
  const b = parse(z.object({ identifier: z.string().min(3, 'Enter your email or phone number') }), req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter your email address or phone number.');
  const user = await findByIdent(id);
  const destination = id.kind === 'email' ? maskEmail(id.value) : maskPhone(id.value);
  if (!user) return res.json({ sent: true, destination });
  const out = await issueOtp({ target: id.value, channel: id.kind === 'email' ? 'email' : 'sms', purpose: 'reset_password', userId: user.id });
  res.json({ sent: true, destination, ...out });
});

r.post('/reset', authLimiter, async (req, res) => {
  const b = parse(z.object({ identifier: z.string(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), newPassword: zPassword }), req.body);
  const id = parseIdentifier(b.identifier);
  if (id.kind === 'handle') throw badRequest('Enter your email address or phone number.');
  const user = await findByIdent(id);
  if (!user) throw badRequest('This code has expired. Request a new one.');
  await consumeOtp(id.value, 'reset_password', b.code);
  await q(
    `UPDATE users SET password_hash=$2, failed_login_count=0, locked_until=NULL, ${id.kind === 'email' ? 'email_verified' : 'phone_verified'}=true, updated_at=now() WHERE id=$1`,
    [user.id, await bcrypt.hash(b.newPassword, 12)],
  );
  await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]); // sign out everywhere
  audit(user.id, 'auth.password_reset', 'user', user.id, {}, ip(req));
  await notify([user.id], { type: 'security', category: 'system', title: 'Your password was reset', body: 'If this was not you, contact support immediately.', link: '/settings/security' });
  res.json({ ok: true });
});

r.post('/password/change', requireAuth, async (req, res) => {
  const b = parse(z.object({ currentPassword: z.string().optional(), newPassword: zPassword }), req.body);
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (user.password_hash) {
    if (!b.currentPassword || !(await bcrypt.compare(b.currentPassword, user.password_hash))) {
      throw badRequest('Your current password is incorrect.', { fields: { currentPassword: 'Incorrect password' } });
    }
  }
  await q('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [user.id, await bcrypt.hash(b.newPassword, 12)]);
  await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL', [user.id, req.user!.sid]);
  audit(user.id, 'auth.password_changed', 'user', user.id, {}, ip(req));
  res.json({ ok: true });
});

// ───────────────────────── 2FA management ─────────────────────────
r.post('/2fa/setup', requireAuth, async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (user.two_factor_enabled) throw conflict('Two-factor authentication is already on.');
  const secret = authenticator.generateSecret();
  await q('UPDATE users SET two_factor_secret_enc=$2 WHERE id=$1', [user.id, encrypt(secret)]);
  const label = user.email ?? user.handle;
  const otpauth = authenticator.keyuri(label, env.appName, secret);
  res.json({ secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
});

function makeBackupCodes() {
  const codes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
  return { codes, hashes: codes.map((c) => sha256(c.replace('-', ''))) };
}

r.post('/2fa/enable', requireAuth, async (req, res) => {
  const b = parse(z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your app') }), req.body);
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  const secret = decrypt(user.two_factor_secret_enc);
  if (!secret) throw badRequest('Start setup first.');
  if (!authenticator.check(b.code, secret)) throw badRequest('That code is not correct. Check the time on your phone and try again.');
  const { codes, hashes } = makeBackupCodes();
  await q('UPDATE users SET two_factor_enabled=true, two_factor_backup=$2 WHERE id=$1', [user.id, hashes]);
  audit(user.id, 'auth.2fa_enabled', 'user', user.id);
  res.json({ enabled: true, backupCodes: codes });
});

r.post('/2fa/disable', requireAuth, async (req, res) => {
  const b = parse(z.object({ code: z.string().min(6) }), req.body);
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (!user.two_factor_enabled) return res.json({ enabled: false });
  if (!(await checkSecondFactor(user, b.code))) throw badRequest('Incorrect authentication code.');
  await q(`UPDATE users SET two_factor_enabled=false, two_factor_secret_enc=NULL, two_factor_backup='{}' WHERE id=$1`, [user.id]);
  audit(user.id, 'auth.2fa_disabled', 'user', user.id);
  res.json({ enabled: false });
});

r.post('/2fa/backup-codes', requireAuth, async (req, res) => {
  const b = parse(z.object({ code: z.string().min(6) }), req.body);
  const user = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (!user.two_factor_enabled) throw badRequest('Turn on two-factor authentication first.');
  if (!(await checkSecondFactor(user, b.code))) throw badRequest('Incorrect authentication code.');
  const { codes, hashes } = makeBackupCodes();
  await q('UPDATE users SET two_factor_backup=$2 WHERE id=$1', [user.id, hashes]);
  res.json({ backupCodes: codes });
});

// ───────────────────────── change / add email & phone ─────────────────────────
r.post('/contact/email', requireAuth, otpLimiter, async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }), req.body);
  if (await one('SELECT 1 FROM users WHERE email=$1 AND id<>$2', [b.email, req.user!.id])) throw conflict('That email is already used by another account.');
  const out = await issueOtp({ target: b.email, channel: 'email', purpose: 'change_email', userId: req.user!.id, payload: { email: b.email } });
  res.json({ sent: true, destination: maskEmail(b.email), ...out });
});
r.post('/contact/email/verify', requireAuth, async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/) }), req.body);
  const row = await consumeOtp(b.email, 'change_email', b.code);
  if (row.user_id !== req.user!.id) throw forbidden();
  const u = await one('UPDATE users SET email=$2, email_verified=true, updated_at=now() WHERE id=$1 RETURNING *', [req.user!.id, b.email]);
  audit(req.user!.id, 'account.email_changed', 'user', req.user!.id);
  res.json(await selfView(u));
});
r.post('/contact/phone', requireAuth, otpLimiter, async (req, res) => {
  const b = parse(z.object({ phone: z.string().min(6) }), req.body);
  const phone = normalizePhone(b.phone);
  if (!phone) throw badRequest('That phone number does not look valid.');
  if (await one('SELECT 1 FROM users WHERE phone_hash=$1 AND id<>$2', [blindIndex(phone), req.user!.id])) throw conflict('That phone number is already used by another account.');
  const out = await issueOtp({ target: phone, channel: 'sms', purpose: 'change_phone', userId: req.user!.id, payload: { phone } });
  res.json({ sent: true, destination: maskPhone(phone), ...out });
});
r.post('/contact/phone/verify', requireAuth, async (req, res) => {
  const b = parse(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) }), req.body);
  const phone = normalizePhone(b.phone);
  if (!phone) throw badRequest('Invalid phone number.');
  const row = await consumeOtp(phone, 'change_phone', b.code);
  if (row.user_id !== req.user!.id) throw forbidden();
  const u = await one('UPDATE users SET phone_enc=$2, phone_hash=$3, phone_verified=true, updated_at=now() WHERE id=$1 RETURNING *', [
    req.user!.id, encrypt(phone), blindIndex(phone),
  ]);
  audit(req.user!.id, 'account.phone_changed', 'user', req.user!.id);
  res.json(await selfView(u));
});

r.post('/google/link', requireAuth, async (req, res) => {
  const b = parse(z.object({ credential: z.string().min(20) }), req.body);
  const g = await verifyGoogle(b.credential);
  if (await one('SELECT 1 FROM users WHERE google_id=$1 AND id<>$2', [g.googleId, req.user!.id])) throw conflict('That Google account is linked to another profile.');
  const u = await one('UPDATE users SET google_id=$2 WHERE id=$1 RETURNING *', [req.user!.id, g.googleId]);
  res.json(await selfView(u));
});
r.post('/google/unlink', requireAuth, async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (!u.password_hash && !u.email_verified && !u.phone_verified) throw badRequest('Set a password first so you can still sign in.');
  const out = await one('UPDATE users SET google_id=NULL WHERE id=$1 RETURNING *', [req.user!.id]);
  res.json(await selfView(out));
});

// ───────────────────────── guardian consent (public) ─────────────────────────
r.get('/guardian/:token', async (req, res) => {
  const row = await one(
    `SELECT g.*, u.name AS child_name, u.date_of_birth FROM guardian_consents g JOIN users u ON u.id=g.user_id WHERE g.token_hash=$1`,
    [sha256(String(req.params.token))],
  );
  if (!row) throw notFound('This consent link is invalid.');
  res.json({
    childName: row.child_name,
    guardianEmail: row.guardian_email,
    decision: row.decision,
    expired: new Date(row.expires_at) < new Date(),
  });
});

r.post('/guardian/:token', async (req, res) => {
  const b = parse(z.object({ decision: z.enum(['granted', 'denied']), guardianName: z.string().trim().min(2, 'Enter your full name').max(80), confirm: z.literal(true, { errorMap: () => ({ message: 'Please confirm you are the parent or legal guardian' }) }) }), req.body);
  await tx(async (c) => {
    const row = (await c.query('SELECT * FROM guardian_consents WHERE token_hash=$1 FOR UPDATE', [sha256(String(req.params.token))])).rows[0];
    if (!row) throw notFound('This consent link is invalid.');
    if (row.decision) throw conflict('A decision has already been recorded for this request.');
    if (new Date(row.expires_at) < new Date()) throw badRequest('This link has expired. Ask the volunteer to send a new request.');
    await c.query('UPDATE guardian_consents SET decision=$2, guardian_name=$3, decided_at=now(), ip=$4 WHERE id=$1', [row.id, b.decision, b.guardianName, ip(req)]);
    await c.query('UPDATE users SET guardian_consent=$2, guardian_consent_at=now() WHERE id=$1', [row.user_id, b.decision]);
    audit(null, `guardian.${b.decision}`, 'user', row.user_id, { guardianName: b.guardianName }, ip(req));
    await notify([row.user_id], {
      type: 'guardian', category: 'system',
      title: b.decision === 'granted' ? 'Your guardian approved your account' : 'Your guardian declined consent',
      body: b.decision === 'granted' ? 'You can now register for in-person events.' : 'You can still browse, but cannot join in-person events.',
      link: '/settings/account',
    });
  });
  res.json({ ok: true });
});

r.post('/guardian-resend', requireAuth, otpLimiter, async (req, res) => {
  const b = parse(z.object({ guardianEmail: z.string().email().optional(), guardianName: z.string().max(80).optional() }), req.body);
  const u = await one('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (!u.is_minor) throw badRequest('Guardian consent is only needed for volunteers under 18.');
  if (u.guardian_consent === 'granted') throw badRequest('Consent has already been granted.');
  if (b.guardianEmail) {
    if (b.guardianEmail.toLowerCase() === u.email) throw badRequest('Guardian email must be different from your own.');
    await q(`UPDATE users SET guardian_email=$2, guardian_consent='pending' WHERE id=$1`, [u.id, b.guardianEmail.toLowerCase()]);
    u.guardian_email = b.guardianEmail.toLowerCase();
  }
  const out = await sendGuardianRequest(u, b.guardianName);
  res.json({ sent: true, ...out });
});

export default r;
