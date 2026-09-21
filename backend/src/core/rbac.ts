/**
 * Roles and permission catalogue. Permissions are `module:action`; data scope (own class, own major,
 * whole tenant) is enforced inside services. Tenant-level overrides live in tbl_sinau_role_permissions,
 * per-user overrides in tbl_sinau_user_permission_overrides. SUPER_ADMIN bypasses all checks.
 */
export const ROLES = [
  'SUPER_ADMIN', 'ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'KAPRODI', 'GURU', 'STAF', 'BK', 'KEUANGAN', 'AUDITOR',
  'SISWA', 'WALI_MURID', 'CALON_SISWA', 'PEMBIMBING_INDUSTRI', 'PENGUJI_EKSTERNAL',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN_SEKOLAH: 'Admin Sekolah', KEPSEK: 'Kepala Sekolah', WAKEPSEK: 'Wakil Kepala Sekolah', KAPRODI: 'Ketua Program Keahlian',
  GURU: 'Guru', STAF: 'Tenaga Kependidikan', BK: 'Guru BK', KEUANGAN: 'Staf Keuangan', AUDITOR: 'Auditor', SISWA: 'Siswa', WALI_MURID: 'Wali Murid',
  CALON_SISWA: 'Calon Siswa', PEMBIMBING_INDUSTRI: 'Pembimbing Industri', PENGUJI_EKSTERNAL: 'Penguji Eksternal',
};

/** Rank for display ordering and "who may manage whom" (lower = more powerful). */
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 0, ADMIN_SEKOLAH: 1, KEPSEK: 2, WAKEPSEK: 3, KAPRODI: 4, AUDITOR: 4, KEUANGAN: 5, BK: 5, GURU: 6, STAF: 6,
  PEMBIMBING_INDUSTRI: 7, PENGUJI_EKSTERNAL: 7, WALI_MURID: 8, SISWA: 9, CALON_SISWA: 10,
};

/** Roles an ADMIN_SEKOLAH may create inside its tenant (everything except SUPER_ADMIN). */
export const TENANT_ROLES: Role[] = ROLES.filter((r) => r !== 'SUPER_ADMIN');
/** Roles with a staff profile (payroll, staff attendance). */
export const STAFF_ROLES: Role[] = ['ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'KAPRODI', 'GURU', 'STAF', 'BK', 'KEUANGAN', 'AUDITOR'];

const P = (module: string, actions: string[], description: string) => actions.map((a) => ({ code: `${module}:${a}`, module, description }));

export const PERMISSIONS = [
  ...P('tenant', ['read', 'write', 'settings'], 'Lembaga: daftar (platform), pengaturan & branding (tenant)'),
  ...P('user', ['read', 'write', 'import', 'roles'], 'Akun pengguna'),
  ...P('rbac', ['read', 'write'], 'Konfigurasi peran & izin'),
  ...P('academic', ['read', 'write'], 'Tahun ajaran, jurusan, mapel, ruang, kelas, jadwal, kalender, kurikulum'),
  ...P('enrollment', ['read', 'write'], 'Anggota kelas & penugasan guru'),
  ...P('material', ['read', 'write', 'publish'], 'Bahan ajar'),
  ...P('assignment', ['read', 'write', 'submit', 'grade'], 'Tugas & pengumpulan'),
  ...P('question', ['read', 'write'], 'Bank soal & konsep'),
  ...P('quiz', ['read', 'write', 'attempt', 'grade'], 'Kuis'),
  ...P('exam', ['read', 'write', 'schedule', 'attempt', 'proctor', 'grade'], 'Ujian online'),
  ...P('grade', ['read', 'write', 'recap'], 'Nilai'),
  ...P('attendance', ['read', 'write', 'self', 'permit_submit', 'permit_review'], 'Absensi & izin'),
  ...P('rapor', ['read', 'write', 'approve', 'export'], 'e-Rapor'),
  ...P('announcement', ['read', 'write'], 'Pengumuman'),
  ...P('notification', ['read'], 'Notifikasi'),
  ...P('counseling', ['read', 'write'], 'Catatan BK (rahasia)'),
  ...P('discipline', ['read', 'write'], 'Kedisiplinan'),
  ...P('extracurricular', ['read', 'write', 'members'], 'Ekstrakurikuler'),
  ...P('achievement', ['read', 'write'], 'Prestasi'),
  ...P('finance', ['read', 'write', 'approve', 'reconcile'], 'Keuangan'),
  ...P('payroll', ['read', 'write', 'approve_finance', 'approve_principal', 'slip_self'], 'Payroll'),
  ...P('asset', ['read', 'write', 'book', 'approve'], 'Aset'),
  ...P('library', ['read', 'write', 'loan'], 'Perpustakaan'),
  ...P('ppdb', ['read', 'write', 'verify', 'enroll', 'self'], 'PPDB'),
  ...P('internship', ['read', 'write', 'journal_write', 'journal_verify'], 'Prakerin'),
  ...P('competency', ['read', 'write', 'assess'], 'Uji kompetensi'),
  ...P('pdp', ['self', 'review'], 'Pelindungan data pribadi'),
  ...P('dapodik', ['export'], 'Ekspor Dapodik'),
  ...P('landing', ['read', 'write'], 'Landing page & berita'),
  ...P('rollover', ['read', 'write'], 'Tutup tahun ajaran'),
  ...P('audit', ['read'], 'Audit log'),
  ...P('dashboard', ['read', 'configure'], 'Dashboard'),
  ...P('letter', ['read', 'write', 'sign'], 'Surat resmi'),
  ...P('alumni', ['read', 'write'], 'Alumni'),
  ...P('report', ['read', 'export'], 'Laporan sekolah'),
  ...P('job', ['read'], 'Status pekerjaan latar'),
  ...P('feature', ['read', 'write'], 'Feature flags'),
];
export const PERMISSION_CODES = new Set(PERMISSIONS.map((p) => p.code));

const all = (module: string) => PERMISSIONS.filter((p) => p.module === module).map((p) => p.code);
const READ_ALL = PERMISSIONS.filter((p) => p.code.endsWith(':read')).map((p) => p.code);

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.code),
  ADMIN_SEKOLAH: [
    'tenant:settings', ...all('user'), ...all('rbac'), ...all('academic'), ...all('enrollment'), ...all('material'), 'assignment:read', 'question:read', 'quiz:read',
    'exam:read', 'exam:write', 'exam:schedule', 'grade:read', 'grade:recap', 'attendance:read', 'attendance:write', 'attendance:permit_review', 'rapor:read', 'rapor:write', 'rapor:export',
    ...all('announcement'), 'notification:read', 'discipline:read', ...all('extracurricular'), ...all('achievement'), 'finance:read', 'payroll:read', 'payroll:slip_self', ...all('asset'), ...all('library'),
    'ppdb:read', 'ppdb:write', 'ppdb:verify', 'ppdb:enroll', 'internship:read', 'internship:write', 'competency:read', 'competency:write', 'pdp:self', 'pdp:review', 'dapodik:export',
    ...all('landing'), ...all('rollover'), 'audit:read', ...all('dashboard'), ...all('letter'), ...all('alumni'), ...all('report'), 'job:read', ...all('feature'),
  ],
  KEPSEK: [...READ_ALL, 'rapor:approve', 'payroll:approve_principal', 'payroll:slip_self', 'finance:approve', 'asset:approve', 'letter:sign', 'letter:write', 'announcement:write', 'pdp:self', 'report:export', 'attendance:self'],
  WAKEPSEK: [
    ...READ_ALL, ...all('academic'), ...all('enrollment'), 'grade:recap', 'attendance:write', 'attendance:permit_review', 'attendance:self', 'rapor:write', 'rapor:export', 'announcement:write',
    ...all('discipline'), ...all('extracurricular'), ...all('achievement'), 'exam:write', 'exam:schedule', 'exam:proctor', 'material:write', 'material:publish', 'question:write', 'letter:write', 'payroll:slip_self', 'pdp:self', 'report:export',
  ],
  KAPRODI: [
    'academic:read', 'enrollment:read', 'user:read', ...all('material'), ...all('question'), 'quiz:read', 'exam:read', 'exam:write', 'exam:schedule', 'exam:proctor', 'grade:read', 'grade:recap', 'attendance:read', 'attendance:self',
    'rapor:read', 'announcement:read', 'announcement:write', 'notification:read', 'discipline:read', 'achievement:read', 'internship:read', 'internship:write', 'competency:read', 'competency:write', 'competency:assess',
    'report:read', 'dashboard:read', 'payroll:slip_self', 'library:read', 'library:loan', 'asset:read', 'asset:book', 'pdp:self', 'letter:read',
  ],
  GURU: [
    'academic:read', 'enrollment:read', 'user:read', ...all('material'), 'assignment:read', 'assignment:write', 'assignment:grade', ...all('question'), 'quiz:read', 'quiz:write', 'quiz:grade',
    'exam:read', 'exam:write', 'exam:schedule', 'exam:proctor', 'exam:grade', 'grade:read', 'grade:write', 'grade:recap', 'attendance:read', 'attendance:write', 'attendance:self', 'attendance:permit_review', 'rapor:read', 'rapor:write',
    'announcement:read', 'announcement:write', 'notification:read', 'discipline:read', 'discipline:write', 'extracurricular:read', 'extracurricular:members', 'achievement:read', 'achievement:write',
    'payroll:slip_self', 'library:read', 'library:loan', 'asset:read', 'asset:book', 'dashboard:read', 'letter:read', 'internship:read', 'internship:journal_verify', 'competency:read', 'competency:assess', 'pdp:self',
  ],
  STAF: ['user:read', 'academic:read', 'announcement:read', 'notification:read', 'payroll:slip_self', 'attendance:self', ...all('library'), 'asset:read', 'asset:write', 'asset:book', 'letter:read', 'letter:write', 'dashboard:read', 'pdp:self'],
  BK: [
    ...all('counseling'), ...all('discipline'), 'user:read', 'academic:read', 'enrollment:read', 'attendance:read', 'attendance:permit_review', 'attendance:self', 'grade:read', 'achievement:read', 'rapor:read',
    'announcement:read', 'announcement:write', 'notification:read', 'dashboard:read', 'report:read', 'payroll:slip_self', 'letter:read', 'pdp:self',
  ],
  KEUANGAN: [...all('finance'), 'payroll:read', 'payroll:write', 'payroll:approve_finance', 'payroll:slip_self', 'user:read', 'academic:read', 'enrollment:read', 'asset:read', 'announcement:read', 'notification:read', 'dashboard:read', 'report:read', 'report:export', 'attendance:self', 'letter:read', 'pdp:self'],
  AUDITOR: [...READ_ALL, 'audit:read', 'report:export', 'pdp:self', 'payroll:slip_self', 'attendance:self'],
  SISWA: [
    'material:read', 'assignment:read', 'assignment:submit', 'quiz:read', 'quiz:attempt', 'exam:read', 'exam:attempt', 'grade:read', 'attendance:read', 'attendance:self', 'attendance:permit_submit',
    'rapor:read', 'announcement:read', 'notification:read', 'extracurricular:read', 'achievement:read', 'finance:read', 'library:read', 'library:loan', 'internship:read', 'internship:journal_write',
    'competency:read', 'pdp:self', 'dashboard:read', 'academic:read',
  ],
  WALI_MURID: ['grade:read', 'attendance:read', 'attendance:permit_submit', 'rapor:read', 'announcement:read', 'notification:read', 'finance:read', 'discipline:read', 'achievement:read', 'extracurricular:read', 'dashboard:read', 'pdp:self', 'academic:read', 'assignment:read'],
  CALON_SISWA: ['ppdb:self', 'notification:read', 'dashboard:read', 'pdp:self'],
  PEMBIMBING_INDUSTRI: ['internship:read', 'internship:journal_verify', 'notification:read', 'dashboard:read', 'pdp:self'],
  PENGUJI_EKSTERNAL: ['competency:read', 'competency:assess', 'notification:read', 'dashboard:read', 'pdp:self'],
};

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
