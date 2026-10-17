/* Promote an existing account to administrator.
 *   npm run make-admin -- you@example.com            (development, uses tsx)
 *   node dist/db/make-admin.js you@example.com        (production build) */
import { pool, one } from './pool';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run make-admin -- <email of an existing account>');
    process.exit(1);
  }
  const u = await one(
    `UPDATE users SET role='admin', verification_status='verified', verified_at=coalesce(verified_at, now())
      WHERE email=$1 AND account_status<>'deleted' RETURNING name, email`,
    [email.toLowerCase()],
  );
  if (!u) {
    console.error(`No account with email ${email}. Sign up in the app first, then run this again.`);
    process.exit(1);
  }
  console.log(`✅ ${u.name} <${u.email}> is now an administrator. Sign out and back in to see the Admin console.`);
}
main().then(() => pool.end());
