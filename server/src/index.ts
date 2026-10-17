import http from 'http';
import { env } from './config/env';
import { createApp } from './app';
import { initSocket } from './lib/socket';
import { migrate } from './db/migrate';
import { startJobs } from './jobs/scheduler';
import { pool } from './db/pool';

async function main() {
  await migrate(); // always bring the schema up to date on boot
  if (env.isProd) {
    if (!env.smtp.host) console.warn('⚠️  SMTP is not configured — verification codes will NOT reach users. Set SMTP_HOST/SMTP_USER/SMTP_PASS.');
    if (env.storage.driver === 'local') console.warn('⚠️  STORAGE_DRIVER=local — uploads are lost if your host wipes the disk on redeploy. Use Cloudinary in production.');
    if (env.appUrl.includes('localhost')) console.warn('⚠️  APP_URL still points to localhost — links in emails and QR codes will be wrong.');
  }
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  if (env.runJobs) startJobs();
  server.listen(env.port, () => {
    console.log(`\n🚀 ${env.appName} API listening on http://localhost:${env.port}  (${env.nodeEnv})`);
    console.log(`   Web app URL: ${env.appUrl}`);
  });
  const shutdown = () => {
    console.log('Shutting down…');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
