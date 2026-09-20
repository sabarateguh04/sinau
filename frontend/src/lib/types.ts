export type Role =
  | 'SUPER_ADMIN' | 'ADMIN_SEKOLAH' | 'KEPSEK' | 'WAKEPSEK' | 'KAPRODI' | 'GURU' | 'STAF' | 'BK' | 'KEUANGAN' | 'AUDITOR'
  | 'SISWA' | 'WALI_MURID' | 'CALON_SISWA' | 'PEMBIMBING_INDUSTRI' | 'PENGUJI_EKSTERNAL';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN_SEKOLAH: 'Admin Sekolah', KEPSEK: 'Kepala Sekolah', WAKEPSEK: 'Wakil Kepala Sekolah', KAPRODI: 'Ketua Program Keahlian',
  GURU: 'Guru', STAF: 'Tenaga Kependidikan', BK: 'Guru BK', KEUANGAN: 'Staf Keuangan', AUDITOR: 'Auditor', SISWA: 'Siswa', WALI_MURID: 'Wali Murid',
  CALON_SISWA: 'Calon Siswa', PEMBIMBING_INDUSTRI: 'Pembimbing Industri', PENGUJI_EKSTERNAL: 'Penguji Eksternal',
};

/** URL prefix per role (/guru/..., /siswa/...). */
export const ROLE_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: 'superadmin', ADMIN_SEKOLAH: 'admin', KEPSEK: 'kepsek', WAKEPSEK: 'wakepsek', KAPRODI: 'kaprodi', GURU: 'guru', STAF: 'staf', BK: 'bk', KEUANGAN: 'keuangan',
  AUDITOR: 'auditor', SISWA: 'siswa', WALI_MURID: 'ortu', CALON_SISWA: 'calon', PEMBIMBING_INDUSTRI: 'pembimbing', PENGUJI_EKSTERNAL: 'penguji',
};
export const PREFIX_ROLE: Record<string, Role> = Object.fromEntries(Object.entries(ROLE_PREFIX).map(([r, p]) => [p, r as Role]));

export interface Tenant {
  id: string; slug: string; name: string; type: string; category: string | null; display_name: string | null; tagline: string | null; logo_url: string | null;
  primary_color: string; accent_color: string; theme: string; self_registration: number; portal_share: string; approval_flow: string; timezone: string; maintenance: number; data_saver_default: number;
  principal_name?: string | null; provinsi_id?: number | null; kota_id?: number | null;
}
export interface Me {
  id: string; username: string; email: string | null; full_name: string; phone: string | null; avatar_url: string | null; gender: string | null; theme: 'system' | 'light' | 'dark'; data_saver: boolean;
  must_change_password: boolean; last_login_at: string | null; roles: Role[]; role_labels: Record<string, string>; permissions: string[]; is_super_admin: boolean;
  tenant_id: string; home_tenant_id: string; tenant: Tenant | null; features: Record<string, boolean>; unread_notifications: number;
  onboarding: { steps: Record<string, boolean>; completed_at: string | null } | null;
  classes?: { id: string; name: string; grade_level: number; major_id: string | null; major_name: string | null; academic_year_id: string }[];
  teaching?: { class_subject_id: string; class_id: string; class_name: string; subject_id: string; subject_name: string; semester: number }[];
  homeroom?: { id: string; name: string }[];
  children?: { id: string; full_name: string; avatar_url: string | null; relation: string; class_name: string | null }[];
  profile?: Record<string, unknown> | null;
}
export interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export type Dict = Record<string, unknown>;
