/**
 * Data-scope helpers. Permissions say WHAT a role may do; scope says on WHICH rows.
 * Tenant-wide roles see everything in their tenant; GURU only their class-subjects (+ homeroom class),
 * KAPRODI their major, SISWA their class, WALI_MURID their children.
 */
import { T } from '../config';
import { query, queryOne } from '../database/db';
import { AuthUser, hasRole } from './auth';
import { forbidden } from './errors';

export const TENANT_WIDE = ['ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'AUDITOR', 'BK', 'KEUANGAN'] as const;
export const isTenantWide = (u: AuthUser) => u.isSuperAdmin || hasRole(u, ...TENANT_WIDE);

/** SQL fragment restricting class_subjects alias `cs` (and its class alias `c`) to what the user may see. */
export function classSubjectScope(u: AuthUser, cs = 'cs', c = 'c'): { sql: string; params: unknown[] } {
  if (isTenantWide(u)) return { sql: '1=1', params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  if (hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) { parts.push(`${cs}.teacher_id = ?`); params.push(u.id); parts.push(`${c}.homeroom_teacher_id = ?`); params.push(u.id); }
  if (hasRole(u, 'KAPRODI')) { parts.push(`${c}.major_id IN (SELECT id FROM \`${T('majors')}\` WHERE head_user_id = ?)`); params.push(u.id); }
  if (hasRole(u, 'SISWA')) { parts.push(`EXISTS (SELECT 1 FROM \`${T('class_students')}\` e WHERE e.class_id = ${cs}.class_id AND e.student_id = ? AND e.status = 'AKTIF')`); params.push(u.id); }
  if (hasRole(u, 'WALI_MURID')) { parts.push(`EXISTS (SELECT 1 FROM \`${T('class_students')}\` e2 JOIN \`${T('guardian_students')}\` g ON g.student_id = e2.student_id WHERE e2.class_id = ${cs}.class_id AND g.guardian_user_id = ? AND e2.status = 'AKTIF')`); params.push(u.id); }
  if (!parts.length) return { sql: '1=0', params: [] };
  return { sql: `(${parts.join(' OR ')})`, params };
}

/** Same idea for a class alias `c` (homeroom, enrolment, major). */
export function classScope(u: AuthUser, c = 'c'): { sql: string; params: unknown[] } {
  if (isTenantWide(u)) return { sql: '1=1', params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  if (hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) {
    parts.push(`${c}.homeroom_teacher_id = ?`); params.push(u.id);
    parts.push(`EXISTS (SELECT 1 FROM \`${T('class_subjects')}\` x WHERE x.class_id = ${c}.id AND x.teacher_id = ?)`); params.push(u.id);
  }
  if (hasRole(u, 'KAPRODI')) { parts.push(`${c}.major_id IN (SELECT id FROM \`${T('majors')}\` WHERE head_user_id = ?)`); params.push(u.id); }
  if (hasRole(u, 'SISWA')) { parts.push(`EXISTS (SELECT 1 FROM \`${T('class_students')}\` e WHERE e.class_id = ${c}.id AND e.student_id = ? AND e.status = 'AKTIF')`); params.push(u.id); }
  if (hasRole(u, 'WALI_MURID')) { parts.push(`EXISTS (SELECT 1 FROM \`${T('class_students')}\` e2 JOIN \`${T('guardian_students')}\` g ON g.student_id = e2.student_id WHERE e2.class_id = ${c}.id AND g.guardian_user_id = ? AND e2.status = 'AKTIF')`); params.push(u.id); }
  if (!parts.length) return { sql: '1=0', params: [] };
  return { sql: `(${parts.join(' OR ')})`, params };
}

/** Throws 403 unless the user may access the class-subject. Returns the row (with class info). */
export async function assertClassSubject(u: AuthUser, classSubjectId: string, opts: { teach?: boolean } = {}) {
  const row = await queryOne(`SELECT cs.*, c.name AS class_name, c.major_id, c.homeroom_teacher_id, c.academic_year_id, s.name AS subject_name FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.id = ? AND cs.tenant_id = ?`, [classSubjectId, u.tenantId]);
  if (!row) throw forbidden('Kelas/mapel tidak ditemukan');
  if (opts.teach) {
    if (isTenantWide(u) && !hasRole(u, 'AUDITOR', 'BK', 'KEUANGAN')) return row;
    if (row.teacher_id === u.id) return row;
    if (hasRole(u, 'KAPRODI') && row.major_id) {
      const m = await queryOne(`SELECT id FROM \`${T('majors')}\` WHERE id = ? AND head_user_id = ?`, [row.major_id, u.id]);
      if (m) return row;
    }
    throw forbidden('Anda bukan pengampu kelas/mapel ini');
  }
  const sc = classSubjectScope(u);
  const ok = await queryOne(`SELECT 1 AS x FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id WHERE cs.id = ? AND ${sc.sql}`, [classSubjectId, ...sc.params]);
  if (!ok) throw forbidden('Tidak punya akses ke kelas/mapel ini');
  return row;
}

export async function assertClass(u: AuthUser, classId: string, opts: { manage?: boolean } = {}) {
  const row = await queryOne(`SELECT c.*, ay.name AS academic_year FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE c.id = ? AND c.tenant_id = ?`, [classId, u.tenantId]);
  if (!row) throw forbidden('Kelas tidak ditemukan');
  if (opts.manage) {
    if ((isTenantWide(u) && !hasRole(u, 'AUDITOR', 'KEUANGAN')) || row.homeroom_teacher_id === u.id) return row;
    throw forbidden('Hanya wali kelas / admin');
  }
  const sc = classScope(u);
  const ok = await queryOne(`SELECT 1 AS x FROM \`${T('classes')}\` c WHERE c.id = ? AND ${sc.sql}`, [classId, ...sc.params]);
  if (!ok) throw forbidden('Tidak punya akses ke kelas ini');
  return row;
}

/** Student ids the user may look at: self (SISWA), children (WALI), or any in scope. */
export async function assertStudentAccess(u: AuthUser, studentId: string) {
  if (isTenantWide(u) || u.id === studentId) return;
  if (hasRole(u, 'WALI_MURID')) {
    const g = await queryOne(`SELECT 1 AS x FROM \`${T('guardian_students')}\` WHERE guardian_user_id = ? AND student_id = ?`, [u.id, studentId]);
    if (g) return;
  }
  if (hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) {
    const sc = classScope(u);
    const row = await queryOne(`SELECT 1 AS x FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE e.student_id = ? AND e.status = 'AKTIF' AND ${sc.sql}`, [studentId, ...sc.params]);
    if (row) return;
  }
  throw forbidden('Tidak punya akses ke data siswa ini');
}

export const studentIdsOfClass = async (classId: string) => (await query(`SELECT student_id FROM \`${T('class_students')}\` WHERE class_id = ? AND status = 'AKTIF'`, [classId])).map((x) => String(x.student_id));
export const childrenOf = async (guardianId: string) => (await query(`SELECT student_id FROM \`${T('guardian_students')}\` WHERE guardian_user_id = ?`, [guardianId])).map((x) => String(x.student_id));
