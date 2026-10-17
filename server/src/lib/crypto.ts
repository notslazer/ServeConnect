import crypto from 'crypto';
import { env } from '../config/env';

const key = Buffer.from(env.encryptionKey, 'hex');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
const blindKey = Buffer.from(env.blindIndexKey, 'hex');

/** AES-256-GCM encrypt a UTF-8 string. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  return encryptBuffer(Buffer.from(plain, 'utf8')).toString('base64');
}
export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    return decryptBuffer(Buffer.from(blob, 'base64')).toString('utf8');
  } catch {
    return null;
  }
}
export function encryptBuffer(buf: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}
export function decryptBuffer(buf: Buffer): Buffer {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Deterministic keyed hash used to look up encrypted values (phone, blood group, OTP targets). */
export function blindIndex(value: string): string {
  return crypto.createHmac('sha256', blindKey).update(value.trim().toLowerCase()).digest('hex');
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Cryptographically random numeric code, e.g. OTPs. */
export function randomDigits(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}
/** Human-friendly code without ambiguous characters (no 0/O/1/I). */
export function randomCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}
export function timingSafeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
