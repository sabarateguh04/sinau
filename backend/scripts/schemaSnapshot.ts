/**
 * Menulis snapshot DDL (backend/database/schema.sql) dan ERD Mermaid (docs/erd.md)
 * dari database yang sedang berjalan. Sumber kebenaran tetap migrations/*.ts —
 * file ini hanya dokumentasi. Jalankan: npm run db:snapshot
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, query } from '../src/database/db';
import { config } from '../src/config';

type Col = { TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_KEY: string; COLUMN_COMMENT: string };
type Fk = { TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string };

async function main() {
  const db = config.db.database;
  const tables = (await query<{ TABLE_NAME: string }>(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'tbl_sinau_%' ORDER BY TABLE_NAME`, [db])).map((r) => r.TABLE_NAME);
  let sql = `-- SINAU schema snapshot (${tables.length} tables) — generated ${new Date().toISOString()}\n-- Source of truth: backend/src/database/migrations/*.ts (run: npm run db:migrate). This file is documentation only.\n\n`;
  for (const t of tables) {
    const [row] = await query<Record<string, string>>(`SHOW CREATE TABLE \`${t}\``);
    sql += (row['Create Table'] ?? '').replace(/ AUTO_INCREMENT=\d+/, '') + ';\n\n';
  }
  fs.writeFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), sql);

  const cols = await query<Col>(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'tbl_sinau_%' ORDER BY TABLE_NAME, ORDINAL_POSITION`, [db]);
  const fks = await query<Fk>(`SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_NAME LIKE 'tbl_sinau_%' ORDER BY TABLE_NAME, COLUMN_NAME`, [db]);
  const short = (t: string) => t.replace(/^tbl_sinau_/, '');
  const groups: Record<string, string[]> = {
    'Platform & akun': ['migrations', 'tenants', 'tenant_features', 'users', 'user_roles', 'role_permissions', 'user_permissions', 'refresh_tokens', 'password_resets', 'invitations', 'student_profiles', 'staff_profiles', 'guardians', 'audit_logs', 'notifications', 'files', 'jobs', 'regions', 'provinsi', 'kota', 'permissions', 'user_permission_overrides', 'user_onboarding', 'guardian_students', 'import_', 'feature_flags', 'tenant_'],
    'Akademik': ['academic_years', 'majors', 'subjects', 'rooms', 'classes', 'class_students', 'class_subjects', 'schedules', 'calendar_events', 'curriculum', 'alumni', 'rollover', 'academic_calendar', 'schedule_entries', 'concepts'],
    'LMS': ['materials', 'material_', 'assignments', 'submissions', 'questions', 'quizzes', 'quiz_', 'grades', 'grade_'],
    'Presensi': ['attendance', 'permits', 'staff_attendance'],
    'Ujian & Rapor': ['exam', 'report_card', 'rapor'],
    'Kesiswaan': ['counseling', 'discipline', 'extracurricular', 'achievements', 'letters', 'letter_templates', 'official_letters'],
    'Keuangan & Payroll': ['fee_', 'invoices', 'invoice_', 'payments', 'payment_', 'refunds', 'reconciliation', 'cash_flows', 'payroll', 'positions', 'salary', 'late_fee_rules', 'payslips', 'job_positions'],
    'Sarana & Perpustakaan': ['assets', 'asset_', 'maintenance', 'books', 'book_loans', 'library_'],
    'PPDB': ['ppdb'],
    'SMK': ['industry', 'internship', 'competency', 'mentors'],
    'Kepatuhan (PDP/Dapodik)': ['pdp', 'consent', 'dapodik', 'retention_policies'],
    'Komunikasi & Landing': ['announcements', 'messages', 'landing', 'news', 'contact', 'dashboard_', 'facilities', 'faqs', 'gallery_items', 'testimonials', 'module_portal_shares'],
  };
  const assigned = new Set<string>();
  const byGroup: Record<string, string[]> = {};
  for (const [g, prefixes] of Object.entries(groups)) {
    byGroup[g] = tables.filter((t) => !assigned.has(t) && prefixes.some((p) => short(t) === p || short(t).startsWith(p)));
    byGroup[g].forEach((t) => assigned.add(t));
  }
  byGroup['Lainnya'] = tables.filter((t) => !assigned.has(t));

  let md = `# ERD SINAU\n\nDihasilkan otomatis dari database (\`npm run db:snapshot\`). ${tables.length} tabel, prefix \`tbl_sinau_\`, PK \`char(36)\` UUID. Tabel milik lembaga memiliki kolom \`tenant_id\` → \`tenants.id\`.\n\nSetiap bagian adalah diagram Mermaid \`erDiagram\` per domain; relasi antar domain digambarkan melalui kolom FK di daftar kolom.\n\n`;
  for (const [g, ts] of Object.entries(byGroup)) {
    if (!ts.length) continue;
    md += `## ${g}\n\n\`\`\`mermaid\nerDiagram\n`;
    for (const t of ts) {
      md += `  ${short(t)} {\n`;
      for (const c of cols.filter((c) => c.TABLE_NAME === t)) {
        const type = c.COLUMN_TYPE.replace(/\s+/g, '_').replace(/[(),']/g, (m) => (m === '(' ? '_' : ''));
        const key = c.COLUMN_KEY === 'PRI' ? ' PK' : c.COLUMN_KEY === 'MUL' && fks.some((f) => f.TABLE_NAME === t && f.COLUMN_NAME === c.COLUMN_NAME) ? ' FK' : '';
        md += `    ${type} ${c.COLUMN_NAME}${key}\n`;
      }
      md += `  }\n`;
    }
    const inGroup = new Set(ts);
    for (const f of fks.filter((f) => inGroup.has(f.TABLE_NAME) && inGroup.has(f.REFERENCED_TABLE_NAME) && f.TABLE_NAME !== f.REFERENCED_TABLE_NAME)) {
      md += `  ${short(f.REFERENCED_TABLE_NAME)} ||--o{ ${short(f.TABLE_NAME)} : "${f.COLUMN_NAME}"\n`;
    }
    md += '```\n\n';
  }
  md += `## Relasi lintas domain\n\n| Tabel | Kolom | Merujuk |\n|---|---|---|\n`;
  for (const f of fks) {
    const gA = Object.entries(byGroup).find(([, ts]) => ts.includes(f.TABLE_NAME))?.[0];
    const gB = Object.entries(byGroup).find(([, ts]) => ts.includes(f.REFERENCED_TABLE_NAME))?.[0];
    if (gA !== gB) md += `| ${short(f.TABLE_NAME)} | ${f.COLUMN_NAME} | ${short(f.REFERENCED_TABLE_NAME)}.${f.REFERENCED_COLUMN_NAME} |\n`;
  }
  fs.mkdirSync(path.join(__dirname, '..', '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'erd.md'), md);
  console.log(`schema.sql: ${tables.length} tables; erd.md: ${fks.length} FKs`);
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
