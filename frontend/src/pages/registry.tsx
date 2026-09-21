/**
 * Page registry: every in-app route (relative to the role prefix) with lazy loading.
 * Nav items only render when their path exists here, so partially built milestones never show dead links.
 */
import { lazy, LazyExoticComponent, ComponentType } from 'react';

export interface PageDef { path: string; component: LazyExoticComponent<ComponentType>; perm?: string | string[] }
const L = (f: () => Promise<{ default: ComponentType }>) => lazy(f);

export const PAGES: PageDef[] = [
  { path: 'dashboard', component: L(() => import('./dashboard/Dashboard')) },
  { path: 'profil', component: L(() => import('./account/Profile')) },
  { path: 'notifikasi', component: L(() => import('./account/Notifications')) },
  { path: 'pengumuman', component: L(() => import('./communication/Announcements')) },
  { path: 'pengumuman/:id', component: L(() => import('./communication/Announcements')) },
  // LMS
  { path: 'materi', component: L(() => import('./lms/Materials')) },
  { path: 'materi/:id', component: L(() => import('./lms/MaterialDetail')) },
  { path: 'tugas', component: L(() => import('./lms/Assignments')) },
  { path: 'tugas/:id', component: L(() => import('./lms/AssignmentDetail')) },
  { path: 'kuis', component: L(() => import('./lms/Quizzes')) },
  { path: 'kuis/:id', component: L(() => import('./lms/QuizDetail')) },
  { path: 'kuis/attempt/:attemptId', component: L(() => import('./lms/QuizAttempt')) },
  { path: 'bank-soal', component: L(() => import('./lms/QuestionBank')) },
  { path: 'ujian', component: L(() => import('./lms/Exams')) },
  { path: 'ujian/attempt/:attemptId', component: L(() => import('./lms/ExamAttempt')) },
  { path: 'ujian/sesi/:id', component: L(() => import('./lms/ExamSession')) },
  { path: 'nilai', component: L(() => import('./lms/Grades')) },
  { path: 'rapor', component: L(() => import('./lms/Rapor')) },
  { path: 'konsep', component: L(() => import('./lms/ConceptMap')) },
  { path: 'laporan', component: L(() => import('./reports/SchoolReport')) },
  // Kesiswaan
  { path: 'bk/konseling', component: L(() => import('./kesiswaan/Counseling')) },
  { path: 'bk/kedisiplinan', component: L(() => import('./kesiswaan/Discipline')) },
  { path: 'ekskul', component: L(() => import('./kesiswaan/Extracurriculars')) },
  { path: 'prestasi', component: L(() => import('./kesiswaan/Achievements')) },
  { path: 'surat', component: L(() => import('./kesiswaan/Letters')) },
  // Keuangan & payroll
  { path: 'keuangan/tagihan', component: L(() => import('./finance/Invoices')) },
  { path: 'keuangan/pembayaran', component: L(() => import('./finance/Payments')) },
  { path: 'keuangan/jenis-biaya', component: L(() => import('./finance/FeeTypes')) },
  { path: 'keuangan/rekonsiliasi', component: L(() => import('./finance/Reconciliation')) },
  { path: 'keuangan/arus-kas', component: L(() => import('./finance/CashFlows')) },
  { path: 'tagihan', component: L(() => import('./finance/StudentInvoices')) },
  { path: 'payroll', component: L(() => import('./finance/Payroll')) },
  { path: 'payroll/slip', component: L(() => import('./finance/Slips')) },
  // Sarana & PPDB
  { path: 'aset', component: L(() => import('./sarana/Assets')) },
  { path: 'perpustakaan', component: L(() => import('./sarana/Library')) },
  { path: 'ppdb', component: L(() => import('./sarana/PpdbAdmin')) },
  { path: 'absensi', component: L(() => import('./attendance/Attendance')) },
  { path: 'absensi/izin', component: L(() => import('./attendance/Permits')) },
  { path: 'absensi/staf', component: L(() => import('./attendance/StaffAttendance')) },
  { path: 'kelas', component: L(() => import('./academic/MyClasses')) },
  { path: 'jadwal', component: L(() => import('./academic/Schedule')) },
  // Akademik (admin)
  { path: 'akademik/tahun-ajaran', component: L(() => import('./academic/AcademicYears')) },
  { path: 'akademik/jurusan', component: L(() => import('./academic/Majors')) },
  { path: 'akademik/mapel', component: L(() => import('./academic/Subjects')) },
  { path: 'akademik/kelas', component: L(() => import('./academic/Classes')) },
  { path: 'akademik/kelas/:id', component: L(() => import('./academic/ClassDetail')) },
  { path: 'akademik/ruang', component: L(() => import('./academic/Rooms')) },
  { path: 'akademik/jadwal', component: L(() => import('./academic/Schedule')) },
  { path: 'akademik/kalender', component: L(() => import('./academic/Calendar')) },
  { path: 'akademik/kurikulum', component: L(() => import('./academic/Curriculum')) },
  { path: 'akademik/alumni', component: L(() => import('./academic/Alumni')) },
  // Pengaturan
  { path: 'pengguna', component: L(() => import('./admin/Users')) },
  { path: 'pengguna/:id', component: L(() => import('./admin/UserDetail')) },
  { path: 'rbac', component: L(() => import('./admin/Rbac')) },
  { path: 'lembaga', component: L(() => import('./admin/TenantSettings')) },
  { path: 'lembaga/:id', component: L(() => import('./superadmin/TenantDetail')) },
  { path: 'branding', component: L(() => import('./admin/Branding')) },
  { path: 'fitur', component: L(() => import('./admin/Features')) },
  { path: 'audit', component: L(() => import('./admin/AuditLog')) },
  { path: 'jobs', component: L(() => import('./admin/Jobs')) },
  { path: 'portal', component: L(() => import('./superadmin/Portal')) },
];

const exact = new Set(PAGES.map((p) => p.path));
export const hasPage = (to: string) => exact.has(to);
