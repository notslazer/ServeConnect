import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable ${name}. Run "npm run setup" and check server/.env`);
  }
  return v;
}
const opt = (name: string, fallback = '') => process.env[name] ?? fallback;
const int = (name: string, fallback: number) => {
  const v = process.env[name];
  return v ? parseInt(v, 10) : fallback;
};
const bool = (name: string, fallback: boolean) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

const nodeEnv = opt('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: int('PORT', 4000),
  appName: opt('APP_NAME', 'ServeConnect'),
  /** Public URL of the web app (used in emails, QR codes, certificate verification links). */
  appUrl: opt('APP_URL', 'http://localhost:5173').replace(/\/$/, ''),
  /** Comma-separated list of allowed browser origins for CORS. */
  corsOrigins: opt('CORS_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  databaseUrl: req('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/serveconnect'),
  databaseSsl: bool('DATABASE_SSL', false),

  jwtAccessSecret: req('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: req('JWT_REFRESH_SECRET'),
  accessTokenTtl: opt('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenDays: int('REFRESH_TOKEN_DAYS', 30),
  sessionIdleDays: int('SESSION_IDLE_DAYS', 7),
  cookieSameSite: opt('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  cookieSecure: bool('COOKIE_SECURE', nodeEnv === 'production'),

  encryptionKey: req('ENCRYPTION_KEY'),
  blindIndexKey: req('BLIND_INDEX_KEY'),
  qrSecret: req('QR_SECRET'),

  googleClientId: opt('GOOGLE_CLIENT_ID'),

  smtp: {
    host: opt('SMTP_HOST'),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: opt('SMTP_USER'),
    pass: opt('SMTP_PASS'),
    from: opt('MAIL_FROM', 'ServeConnect <no-reply@serveconnect.local>'),
  },

  sms: {
    provider: opt('SMS_PROVIDER', 'console') as 'console' | 'twilio' | 'fast2sms',
    twilioSid: opt('TWILIO_ACCOUNT_SID'),
    twilioToken: opt('TWILIO_AUTH_TOKEN'),
    twilioFrom: opt('TWILIO_FROM'),
    fast2smsKey: opt('FAST2SMS_API_KEY'),
    defaultCountryCode: opt('DEFAULT_COUNTRY_CODE', '+91'),
  },

  storage: {
    driver: opt('STORAGE_DRIVER', 'local') as 'local' | 'cloudinary',
    localDir: opt('UPLOAD_DIR', 'uploads'),
    publicBaseUrl: opt('PUBLIC_API_URL', 'http://localhost:4000').replace(/\/$/, ''),
    cloudinaryUrl: opt('CLOUDINARY_URL'),
  },
  clamavHost: opt('CLAMAV_HOST'),
  clamavPort: int('CLAMAV_PORT', 3310),

  vapidPublicKey: opt('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: opt('VAPID_PRIVATE_KEY'),
  vapidSubject: opt('VAPID_SUBJECT', 'mailto:admin@serveconnect.local'),

  nominatimUrl: opt('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
  weatherUrl: opt('WEATHER_URL', 'https://api.open-meteo.com/v1/forecast'),

  docRetentionDays: int('DOC_RETENTION_DAYS', 90),
  runJobs: bool('RUN_JOBS', true),
  serveClient: bool('SERVE_CLIENT', true),
  devExposeOtp: nodeEnv !== 'production' && bool('DEV_EXPOSE_OTP', true),
};
