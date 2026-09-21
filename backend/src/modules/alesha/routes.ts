import { Router } from 'express';
import { z } from 'zod';
import { authenticate, validate } from '../../middlewares';
import { ok, wrap } from '../../core/http';
import { ALESHA, TUTOR_MODES, chat, ChatTurn } from './engine';

/**
 * Alesha AI. Mounted BEFORE the auth gate so the public site can use it too; when a Bearer
 * token is present the reply is personalised (student/teacher/admin data). An invalid token
 * simply degrades to the public persona instead of failing.
 */
const r = Router();
const optionalAuth: typeof authenticate = (req, res, next) => (req.headers.authorization ? authenticate(req, res, () => next()) : next());

r.get('/status', (_req, res) => { ok(res, { ...ALESHA, ready: true, modes: TUTOR_MODES }); });

r.post('/chat', optionalAuth, validate(z.object({
  message: z.string().max(2000).default(''),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).optional(),
  context: z.object({ page: z.string().max(200).optional(), tenant_slug: z.string().max(60).optional(), mode: z.enum(['explain', 'simplify', 'example', 'why', 'practice', 'quiz', 'challenge', 'review', 'exam', 'socratic']).optional(), material_title: z.string().max(200).nullable().optional(), state: z.record(z.string(), z.unknown()).nullable().optional() }).optional(),
})), wrap(async (req, res) => {
  const history = (req.body.history ?? []) as ChatTurn[];
  ok(res, await chat(req.body.message, history, req.body.context ?? {}, req.auth ?? null));
}));

export default r;
