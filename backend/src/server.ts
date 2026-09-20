import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './database/migrate';
import { logger } from './core/logger';
import { startJobWorker } from './jobs/worker';

runMigrations()
  .then(() => {
    const app = createApp();
    const server = app.listen(config.port, () => logger.info(`SINAU listening on http://localhost:${config.port}`));
    server.keepAliveTimeout = 65_000;
    if (config.jobs.enabled) startJobWorker();
    const shutdown = () => { logger.info('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((e) => {
    logger.error(e, 'startup failed (database?)');
    process.exit(1);
  });
