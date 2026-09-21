import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './core/logger';
import { authenticate, maintenanceGate, globalLimiter, notFoundHandler, errorHandler } from './middlewares';
import { modules } from './modules';
import authRoutes from './modules/auth/routes';
import publicRoutes from './modules/public/routes';
import aleshaRoutes from './modules/alesha/routes';
import systemRoutes from './modules/system/routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/assets') || req.url === '/api/v1/health' }, customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug') }));

  const api = express.Router();
  api.use(globalLimiter);
  api.use('/auth', authRoutes);
  api.use('/public', publicRoutes); // tenant landing, PPDB public, shared materials — no login
  api.use('/alesha', aleshaRoutes); // Alesha AI — public persona without token, personalised with one
  api.use('/', systemRoutes); // health, files, events (SSE), jobs, notifications, regions

  // Everything else: authenticated + tenant maintenance gate.
  api.use(authenticate, maintenanceGate);
  for (const m of modules) api.use(m.path, m.router);

  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // Single-port deployment: serve the built frontend with SPA fallback.
  if (config.serveFrontend && fs.existsSync(path.join(config.frontendDist, 'index.html'))) {
    app.use(express.static(config.frontendDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
    logger.info({ dist: config.frontendDist }, 'serving frontend');
  } else {
    app.get('/', (_req, res) => { res.json({ name: 'SINAU API', docs: '/api/v1/health', hint: 'Build the frontend (npm run build) to serve it from this port.' }); });
  }

  app.use(errorHandler);
  return app;
}
