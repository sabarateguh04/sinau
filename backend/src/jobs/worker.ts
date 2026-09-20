/**
 * In-process job worker backed by tbl_sinau_jobs. Claims one PENDING job at a time with an atomic
 * UPDATE (works on MySQL and MariaDB without SKIP LOCKED), runs the registered handler, records the
 * result. Also runs lightweight scheduled tasks (daily/monthly) by enqueueing jobs at boot + interval.
 */
import { T, config } from '../config';
import { query, queryOne, execute } from '../database/db';
import { logger } from '../core/logger';
import { enqueueJob } from '../core/services';

export type JobHandler = (payload: Record<string, unknown>, job: { id: string; tenant_id: string | null; created_by: string | null }) => Promise<unknown>;
const handlers = new Map<string, JobHandler>();
export const registerJob = (type: string, h: JobHandler) => handlers.set(type, h);

const workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let timer: NodeJS.Timeout | null = null;
let running = false;

async function claimOne() {
  // Mark the oldest runnable job as RUNNING for this worker, then read it back.
  const res = await execute(
    `UPDATE \`${T('jobs')}\` SET status = 'RUNNING', locked_at = NOW(), attempts = attempts + 1, error = ? WHERE status = 'PENDING' AND run_at <= NOW() ORDER BY run_at ASC LIMIT 1`,
    [workerId],
  );
  if (!res.affectedRows) return null;
  return queryOne(`SELECT * FROM \`${T('jobs')}\` WHERE status = 'RUNNING' AND error = ? ORDER BY locked_at DESC LIMIT 1`, [workerId]);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 10; i++) {
      const job = await claimOne();
      if (!job) break;
      const h = handlers.get(String(job.type));
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload ?? {};
      try {
        if (!h) throw new Error(`no handler for ${job.type}`);
        const result = await h(payload, { id: String(job.id), tenant_id: job.tenant_id ? String(job.tenant_id) : null, created_by: job.created_by ? String(job.created_by) : null });
        await execute(`UPDATE \`${T('jobs')}\` SET status = 'DONE', finished_at = NOW(), result = ?, error = NULL WHERE id = ?`, [JSON.stringify(result ?? {}), job.id]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const retry = Number(job.attempts) < Number(job.max_attempts);
        await execute(`UPDATE \`${T('jobs')}\` SET status = ?, finished_at = ?, error = ?, run_at = ? WHERE id = ?`,
          [retry ? 'PENDING' : 'FAILED', retry ? null : new Date(), msg.slice(0, 2000), retry ? new Date(Date.now() + 60_000 * Number(job.attempts)) : job.run_at, job.id]);
        logger.warn({ job: job.id, type: job.type, err: msg }, 'job failed');
      }
    }
    // Recover jobs stuck in RUNNING for > 15 minutes (crashed worker).
    await execute(`UPDATE \`${T('jobs')}\` SET status = 'PENDING', locked_at = NULL WHERE status = 'RUNNING' AND locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`);
  } catch (e) {
    logger.error(e, 'job worker tick error');
  } finally {
    running = false;
  }
}

/** Scheduled tasks: enqueue once per period per tenant (guarded by an existing job of same type+period). */
async function schedule() {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const tenants = await query(`SELECT id FROM \`${T('tenants')}\` WHERE is_active = 1 AND deleted_at IS NULL AND slug <> 'platform'`);
  for (const t of tenants) {
    const tid = String(t.id);
    await enqueueOnce('reminder.daily', { date: today }, tid, `${today}`);
    await enqueueOnce('finance.late_fees', { date: today }, tid, `${today}`);
    await enqueueOnce('pdp.retention', { month }, tid, `${month}`);
  }
}
async function enqueueOnce(type: string, payload: Record<string, unknown>, tenantId: string, periodKey: string) {
  const exists = await queryOne(`SELECT id FROM \`${T('jobs')}\` WHERE tenant_id = ? AND type = ? AND JSON_EXTRACT(payload, '$.key') = ? LIMIT 1`, [tenantId, type, periodKey]);
  if (exists) return;
  await enqueueJob(type, { ...payload, key: periodKey }, { tenantId, maxAttempts: 1 });
}

export function startJobWorker() {
  if (timer) return;
  // Register handlers from modules (side-effect imports).
  require('./handlers');
  timer = setInterval(tick, config.jobs.pollMs);
  setTimeout(tick, 2000);
  schedule().catch((e) => logger.warn(e, 'schedule failed'));
  setInterval(() => schedule().catch(() => undefined), 60 * 60 * 1000);
  logger.info({ handlers: [...handlers.keys()] }, 'job worker started');
}
