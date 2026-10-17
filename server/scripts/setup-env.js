// Creates server/.env from .env.example and fills every secret with a strong random value.
// Usage: npm run setup   (safe to re-run: it never overwrites an existing .env)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const envPath = path.join(__dirname, '..', '.env');
const examplePath = path.join(__dirname, '..', '.env.example');
if (fs.existsSync(envPath)) {
  console.log('.env already exists — leaving it untouched.');
  process.exit(0);
}
let txt = fs.readFileSync(examplePath, 'utf8');
const vapid = webpush.generateVAPIDKeys();
const fill = {
  JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  BLIND_INDEX_KEY: crypto.randomBytes(32).toString('hex'),
  QR_SECRET: crypto.randomBytes(32).toString('hex'),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
};
for (const [k, v] of Object.entries(fill)) {
  txt = txt.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
}
fs.writeFileSync(envPath, txt);
console.log('Created server/.env with fresh secrets and VAPID keys.');
console.log('Now edit it to add your SMTP / Google / Cloudinary / Twilio values (all optional for local dev).');
