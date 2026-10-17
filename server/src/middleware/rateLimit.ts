import { rateLimit } from 'express-rate-limit';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message } },
  });

export const apiLimiter = make(60_000, 300, 'Too many requests. Please slow down.');
export const authLimiter = make(15 * 60_000, 30, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
export const otpLimiter = make(60 * 60_000, 10, 'Too many codes requested. Please wait an hour and try again.');
export const writeLimiter = make(60_000, 60, 'You are doing that too often. Please wait a minute.');
