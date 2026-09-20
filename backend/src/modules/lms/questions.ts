import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow } from '../../core/crud';
import { isTenantWide } from '../../core/scope';
import { newId } from '../../core/ids';
import { readSheet } from '../users/routes';
import { upload, fileUrl } from '../../core/services';
import { audit } from '../../core/services';

const r = Router();

export const QUESTION_TYPES = ['MC', 'MCX', 'TF', 'SHORT', 'MATCH', 'ESSAY'] as const;
const optionSchema = z.object({ key: z.string().min(1).max(4), text: z.string().min(1).max(4000), is_correct: z.boolean().optional(), misconception: z.string().max(200).nullable().optional() });
export const questionSchema = z.object({
  subject_id: z.string().nullable().optional(), concept_id: z.string().nullable().optional(), type: z.enum(QUESTION_TYPES).default('MC'), text: z.string().min(1).max(20000),
  options: z.array(optionSchema).nullable().optional(), answer_key: z.any().optional(), explanation: z.string().max(4000).nullable().optional(),
  difficulty: z.enum(['MUDAH', 'SEDANG', 'SULIT']).optional(), points: z.number().min(0.5).max(100).optional(), tags: z.array(z.string().max(40)).nullable().optional(), grade_level: z.number().int().nullable().optional(),
  image_file_id: z.string().nullable().optional(), is_active: z.boolean().optional(),
});

/** Normalises the answer key per type and validates option sets. */
export function normalizeQuestion(input: Record<string, unknown>) {
  const type = String(input.type ?? 'MC');
  const options = (input.options ?? null) as { key: string; text: string; is_correct?: boolean; misconception?: string | null }[] | null;
  let answer_key: unknown = input.answer_key ?? null;
  if (type === 'MC' || type === 'MCX') {
    if (!options || options.length < 2) throw badRequest('Soal pilihan ganda butuh minimal 2 opsi');
    const correct = options.filter((o) => o.is_correct).map((o) => o.key);
    if (type === 'MC' && correct.length !== 1) throw badRequest('Pilihan ganda harus punya tepat 1 jawaban benar');
    if (type === 'MCX' && correct.length < 1) throw badRequest('Pilih minimal 1 jawaban benar');
    answer_key = correct;
  } else if (type === 'TF') {
    if (typeof answer_key !== 'boolean') throw badRequest('Benar/Salah butuh answer_key true/false');
  } else if (type === 'SHORT') {
    const arr = Array.isArray(answer_key) ? answer_key : answer_key ? [answer_key] : [];
    if (!arr.length) throw badRequest('Isian singkat butuh minimal 1 jawaban');
    answer_key = arr.map((a: unknown) => String(a).trim());
  } else if (type === 'MATCH') {
    if (!Array.isArray(answer_key) || !answer_key.length) throw badRequest('Menjodohkan butuh pasangan [{left,right}]');
  } else if (type === 'ESSAY') {
    answer_key = answer_key ? String(answer_key) : null; // rubric / model answer
  }
  // JSON columns: always store valid JSON text (MariaDB CHECK json_valid rejects raw booleans/numbers from the driver).
  return { ...input, type, options, answer_key: answer_key === null || answer_key === undefined ? null : JSON.stringify(answer_key) };
}

/** Scores a single answer. Returns null for essay (manual). */
export function scoreAnswer(q: { type: string; answer_key: unknown; options?: unknown; points: number }, answer: unknown): { is_correct: boolean | null; score: number | null } {
  const key = typeof q.answer_key === 'string' && q.type !== 'ESSAY' && q.type !== 'SHORT' ? safeJson(q.answer_key) : q.answer_key;
  const pts = Number(q.points) || 1;
  if (answer === null || answer === undefined || answer === '') return { is_correct: false, score: 0 };
  switch (q.type) {
    case 'MC': return { is_correct: Array.isArray(key) && key[0] === String(answer), score: Array.isArray(key) && key[0] === String(answer) ? pts : 0 };
    case 'MCX': {
      const a = new Set((Array.isArray(answer) ? answer : [answer]).map(String));
      const k = new Set((Array.isArray(key) ? key : []).map(String));
      const exact = a.size === k.size && [...a].every((x) => k.has(x));
      if (exact) return { is_correct: true, score: pts };
      // partial credit: correct picks minus wrong picks, floored at 0
      const correctPicks = [...a].filter((x) => k.has(x)).length;
      const wrongPicks = [...a].filter((x) => !k.has(x)).length;
      const frac = Math.max(0, (correctPicks - wrongPicks) / (k.size || 1));
      return { is_correct: false, score: Math.round(frac * pts * 100) / 100 };
    }
    case 'TF': return { is_correct: Boolean(answer) === Boolean(key), score: Boolean(answer) === Boolean(key) ? pts : 0 };
    case 'SHORT': {
      const arr = (Array.isArray(key) ? key : typeof key === 'string' ? safeJson(key) ?? [key] : []) as string[];
      const norm = (s: unknown) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
      const okk = arr.some((k) => norm(k) === norm(answer));
      return { is_correct: okk, score: okk ? pts : 0 };
    }
    case 'MATCH': {
      const pairs = (Array.isArray(key) ? key : []) as { left: string; right: string }[];
      const given = (answer && typeof answer === 'object' ? answer : {}) as Record<string, string>;
      const hit = pairs.filter((p) => given[p.left] === p.right).length;
      const frac = pairs.length ? hit / pairs.length : 0;
      return { is_correct: frac === 1, score: Math.round(frac * pts * 100) / 100 };
    }
    default: return { is_correct: null, score: null };
  }
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

export const presentQuestion = (row: Record<string, unknown>, hideKey = false) => {
  const options = typeof row.options === 'string' ? safeJson(row.options) : row.options;
  const out: Record<string, unknown> = { ...row, options, answer_key: typeof row.answer_key === 'string' ? safeJson(row.answer_key) ?? row.answer_key : row.answer_key, tags: typeof row.tags === 'string' ? safeJson(row.tags) : row.tags, image_url: fileUrl(row.image_file_id as string | null) };
  if (hideKey) {
    if (row.type === 'MATCH' && Array.isArray(out.answer_key)) {
      const pairs = out.answer_key as { left: string; right: string }[];
      out.match = { lefts: pairs.map((p) => p.left), rights: [...new Set(pairs.map((p) => p.right))].sort() };
    }
    out.answer_key = undefined; out.explanation = undefined;
    if (Array.isArray(options)) out.options = options.map((o: { key: string; text: string }) => ({ key: o.key, text: o.text }));
  }
  return out;
};

// ---------- Concepts ----------
const conceptSchema = z.object({ subject_id: z.string().nullable().optional(), code: z.string().min(1).max(40), name: z.string().min(2).max(150), description: z.string().max(2000).nullable().optional(), parent_id: z.string().nullable().optional(), grade_level: z.number().int().nullable().optional() });
r.use('/concepts', crudRouter({ table: 'concepts', searchable: ['t.code', 't.name'], sortable: ['code', 'name'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: ['question:read', 'grade:read'], write: ['question:write'] }, select: `s.name AS subject_name, (SELECT COUNT(*) FROM \`${T('questions')}\` q WHERE q.concept_id = t.id) AS question_count`, joins: `LEFT JOIN \`${T('subjects')}\` s ON s.id = t.subject_id`, filters: [{ param: 'subject_id', column: 't.subject_id' }, { param: 'grade_level', column: 't.grade_level' }], createSchema: conceptSchema, updateSchema: conceptSchema.partial() }));

// ---------- Questions ----------
r.use('/', crudRouter({
  table: 'questions', searchable: ['t.text'], sortable: ['created_at', 'difficulty', 'type', 'usage_count'], perms: { read: ['question:read'], write: ['question:write'] },
  select: 's.name AS subject_name, cp.name AS concept_name, cp.code AS concept_code, u.full_name AS author_name',
  joins: `LEFT JOIN \`${T('subjects')}\` s ON s.id = t.subject_id LEFT JOIN \`${T('concepts')}\` cp ON cp.id = t.concept_id LEFT JOIN \`${T('users')}\` u ON u.id = t.created_by`,
  filters: [{ param: 'subject_id', column: 't.subject_id' }, { param: 'concept_id', column: 't.concept_id' }, { param: 'type', column: 't.type' }, { param: 'difficulty', column: 't.difficulty' }, { param: 'grade_level', column: 't.grade_level' }, { param: 'is_active', column: 't.is_active', op: 'BOOL' }, { param: 'created_by', column: 't.created_by' }],
  scope: (req) => (isTenantWide(req.auth!) ? null : { sql: '1=1', params: [] }), // teachers share the tenant bank; writes are still checked by permission
  createSchema: questionSchema, updateSchema: questionSchema.partial(),
  toRow: (input, req, isCreate) => { const n = normalizeQuestion({ ...(input as Record<string, unknown>) }); return isCreate ? { ...n, created_by: req.auth!.id } : n; },
  present: (row, req) => presentQuestion(row, false && !!req),
}));

/** Bulk import from xlsx: columns type,text,option_a..option_e,correct,explanation,difficulty,points,concept_code,subject_code */
r.post('/import', requirePermission('question:write'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('Berkas tidak ada');
  const u = req.auth!;
  const rows = await readSheet(req.file.path, req.file.mimetype);
  const subjects = await query(`SELECT id, code FROM \`${T('subjects')}\` WHERE tenant_id = ?`, [u.tenantId]);
  const concepts = await query(`SELECT id, code FROM \`${T('concepts')}\` WHERE tenant_id = ?`, [u.tenantId]);
  const errors: { row_no: number; message: string }[] = [];
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i];
    try {
      const type = String(rec.type ?? 'MC').toUpperCase();
      const opts: { key: string; text: string; is_correct: boolean }[] = [];
      const correct = String(rec.correct ?? '').toUpperCase().split(/[,; ]+/).filter(Boolean);
      for (const k of ['A', 'B', 'C', 'D', 'E']) { const v = rec[`option_${k.toLowerCase()}`]; if (v) opts.push({ key: k, text: String(v), is_correct: correct.includes(k) }); }
      const subj = rec.subject_code ? subjects.find((s) => String(s.code).toUpperCase() === String(rec.subject_code).toUpperCase()) : null;
      const con = rec.concept_code ? concepts.find((c) => String(c.code).toUpperCase() === String(rec.concept_code).toUpperCase()) : null;
      const base: Record<string, unknown> = { type, text: String(rec.text ?? ''), explanation: rec.explanation ?? null, difficulty: ['MUDAH', 'SEDANG', 'SULIT'].includes(String(rec.difficulty).toUpperCase()) ? String(rec.difficulty).toUpperCase() : 'SEDANG', points: Number(rec.points) || 1, subject_id: subj?.id ?? null, concept_id: con?.id ?? null, grade_level: rec.grade_level ? Number(rec.grade_level) : null };
      if (type === 'MC' || type === 'MCX') base.options = opts;
      else if (type === 'TF') base.answer_key = /^(true|benar|b|1)$/i.test(String(rec.correct));
      else if (type === 'SHORT') base.answer_key = String(rec.correct ?? '').split('|').map((s) => s.trim()).filter(Boolean);
      else base.answer_key = rec.correct ?? null;
      if (!base.text) throw new Error('text kosong');
      const norm = normalizeQuestion(base);
      await insertRow('questions', { id: newId(), tenant_id: u.tenantId, ...norm, created_by: u.id });
      n++;
    } catch (e) { errors.push({ row_no: i + 2, message: e instanceof Error ? e.message : String(e) }); }
  }
  await audit(req, 'question.import', 'questions', undefined, undefined, { total: rows.length, success: n });
  ok(res, { total: rows.length, success: n, errors });
}));

r.get('/stats/summary', requirePermission('question:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, {
    by_subject: await query(`SELECT s.name, COUNT(*) AS c FROM \`${T('questions')}\` q LEFT JOIN \`${T('subjects')}\` s ON s.id = q.subject_id WHERE q.tenant_id = ? GROUP BY s.name ORDER BY c DESC`, [tid]),
    by_type: await query(`SELECT type, COUNT(*) AS c FROM \`${T('questions')}\` WHERE tenant_id = ? GROUP BY type`, [tid]),
    by_difficulty: await query(`SELECT difficulty, COUNT(*) AS c FROM \`${T('questions')}\` WHERE tenant_id = ? GROUP BY difficulty`, [tid]),
    total: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('questions')}\` WHERE tenant_id = ?`, [tid]))?.c ?? 0),
  });
}));

export default r;
