import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { uploadsRoot } from './lib/storage';

import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import postRoutes from './modules/posts/routes';
import eventRoutes from './modules/events/routes';
import teamRoutes from './modules/teams/routes';
import chatRoutes from './modules/chat/routes';
import requestRoutes from './modules/requests/routes';
import notificationRoutes from './modules/notifications/routes';
import certificateRoutes from './modules/certificates/routes';
import gamificationRoutes from './modules/gamification/routes';
import verificationRoutes from './modules/verification/routes';
import reportRoutes from './modules/reports/routes';
import adminRoutes from './modules/admin/routes';
import csrRoutes from './modules/csr/routes';
import miscRoutes from './modules/misc/routes';

export function createApp() {
  const app = express();
  // Number of proxies in front of the API (Render = 1; Vercel rewrite -> Render = 2). Used for client IPs in rate limits.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com', 'https://apis.google.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://fonts.googleapis.com', 'https://unpkg.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
          frameSrc: ["'self'", 'https://accounts.google.com'],
          mediaSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Public media (local storage driver). Private documents are never served statically.
  app.use('/uploads', express.static(path.join(uploadsRoot, 'public'), { maxAge: '30d', immutable: true, fallthrough: false }));

  const api = express.Router();
  api.use(apiLimiter);
  api.use('/auth', authRoutes);
  api.use('/users', userRoutes);
  api.use('/posts', postRoutes);
  api.use('/events', eventRoutes);
  api.use('/teams', teamRoutes);
  api.use('/chat', chatRoutes);
  api.use('/requests', requestRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/certificates', certificateRoutes);
  api.use('/engagement', gamificationRoutes);
  api.use('/verification', verificationRoutes);
  api.use('/reports', reportRoutes);
  api.use('/admin', adminRoutes);
  api.use('/csr', csrRoutes);
  api.use('/', miscRoutes);
  api.use(notFoundHandler);
  app.use('/api', api);

  // Serve the built web app (single-service deployment). SPA fallback to index.html.
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  if (env.serveClient && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
    console.log(`[app] serving web client from ${clientDist}`);
  }

  app.use(errorHandler);
  return app;
}
