import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Bot, BookOpen, ClipboardList, ListChecks, FileQuestion, GraduationCap, CalendarCheck, Megaphone, Users, School, Building2, Settings2, ShieldCheck, Layers,
  CalendarDays, BookMarked, Wallet, Receipt, Banknote, Boxes, Library, UserPlus, Briefcase, Award, HeartHandshake, ScrollText, FileBarChart2, Globe, RefreshCw, Lock, Bell, ClipboardCheck, PenTool, Star, Flag, History, Landmark, Database, Workflow, ToggleLeft, FileSpreadsheet, Palette, Baby, KeyRound, LineChart, BadgeCheck, MapPin, Sparkles,
} from 'lucide-react';
import { Role } from './types';

export interface NavItem { label: string; to: string; icon: LucideIcon; perm?: string | string[]; feature?: string; badge?: string }
export interface NavSection { title?: string; items: NavItem[] }

const D = { label: 'Dashboard', to: 'dashboard', icon: LayoutDashboard };
const AI: NavItem = { label: 'AI Chat Bot', to: 'chat-ai', icon: Bot, badge: 'AI' };

const lms = (extra: NavItem[] = []): NavSection => ({ title: 'Pembelajaran', items: [
  { label: 'Materi', to: 'materi', icon: BookOpen, perm: 'material:read' },
  { label: 'Tugas', to: 'tugas', icon: ClipboardList, perm: 'assignment:read' },
  { label: 'Kuis', to: 'kuis', icon: ListChecks, perm: 'quiz:read' },
  { label: 'Ujian', to: 'ujian', icon: PenTool, perm: 'exam:read', feature: 'exam' },
  { label: 'Bank Soal', to: 'bank-soal', icon: FileQuestion, perm: 'question:read' },
  { label: 'Nilai', to: 'nilai', icon: GraduationCap, perm: 'grade:read' },
  { label: 'Absensi', to: 'absensi', icon: CalendarCheck, perm: 'attendance:read' },
  { label: 'e-Rapor', to: 'rapor', icon: BookMarked, perm: 'rapor:read', feature: 'rapor' },
  { label: 'Peta Konsep', to: 'konsep', icon: Sparkles, perm: 'grade:read' },
  ...extra,
] });
const komunikasi: NavSection = { title: 'Komunikasi', items: [
  { label: 'Pengumuman', to: 'pengumuman', icon: Megaphone, perm: 'announcement:read' },
  { label: 'Notifikasi', to: 'notifikasi', icon: Bell },
  { label: 'Surat Resmi', to: 'surat', icon: ScrollText, perm: 'letter:read', feature: 'letter' },
] };
const akademik: NavSection = { title: 'Akademik', items: [
  { label: 'Tahun Ajaran', to: 'akademik/tahun-ajaran', icon: CalendarDays, perm: 'academic:read' },
  { label: 'Jurusan', to: 'akademik/jurusan', icon: Layers, perm: 'academic:read' },
  { label: 'Mata Pelajaran', to: 'akademik/mapel', icon: BookMarked, perm: 'academic:read' },
  { label: 'Kelas & Rombel', to: 'akademik/kelas', icon: School, perm: 'academic:read' },
  { label: 'Ruang', to: 'akademik/ruang', icon: MapPin, perm: 'academic:read' },
  { label: 'Jadwal', to: 'akademik/jadwal', icon: CalendarDays, perm: 'academic:read' },
  { label: 'Kalender', to: 'akademik/kalender', icon: CalendarDays, perm: 'academic:read' },
  { label: 'Kurikulum', to: 'akademik/kurikulum', icon: Workflow, perm: 'academic:read' },
  { label: 'Alumni', to: 'akademik/alumni', icon: Award, perm: 'alumni:read' },
  { label: 'Tutup Tahun Ajaran', to: 'akademik/rollover', icon: RefreshCw, perm: 'rollover:read', feature: 'rollover' },
] };
const kesiswaan: NavSection = { title: 'Kesiswaan', items: [
  { label: 'Konseling (BK)', to: 'bk/konseling', icon: HeartHandshake, perm: 'counseling:read', feature: 'bk' },
  { label: 'Kedisiplinan', to: 'bk/kedisiplinan', icon: Flag, perm: 'discipline:read', feature: 'bk' },
  { label: 'Ekstrakurikuler', to: 'ekskul', icon: Star, perm: 'extracurricular:read', feature: 'ekskul' },
  { label: 'Prestasi', to: 'prestasi', icon: Award, perm: 'achievement:read' },
  { label: 'Izin / Sakit', to: 'absensi/izin', icon: ClipboardCheck, perm: ['attendance:permit_review', 'attendance:permit_submit'] },
] };
const keuangan: NavSection = { title: 'Keuangan', items: [
  { label: 'Tagihan', to: 'keuangan/tagihan', icon: Receipt, perm: 'finance:read', feature: 'finance' },
  { label: 'Pembayaran', to: 'keuangan/pembayaran', icon: Banknote, perm: 'finance:read', feature: 'finance' },
  { label: 'Pos Tarif', to: 'keuangan/pos-tarif', icon: Wallet, perm: 'finance:read', feature: 'finance' },
  { label: 'Kas & Bank', to: 'keuangan/kas', icon: Landmark, perm: 'finance:read', feature: 'finance' },
  { label: 'Rekonsiliasi', to: 'keuangan/rekonsiliasi', icon: RefreshCw, perm: 'finance:read', feature: 'finance' },
] };
const sarana: NavSection = { title: 'Sarana & Prasarana', items: [
  { label: 'Aset & Inventaris', to: 'aset', icon: Boxes, perm: 'asset:read', feature: 'asset' },
  { label: 'Perpustakaan', to: 'perpustakaan', icon: Library, perm: 'library:read', feature: 'library' },
] };
const smk: NavSection = { title: 'Vokasi / SMK', items: [
  { label: 'Prakerin / Magang', to: 'prakerin', icon: Briefcase, perm: 'internship:read', feature: 'smk' },
  { label: 'Uji Kompetensi', to: 'uji-kompetensi', icon: BadgeCheck, perm: 'competency:read', feature: 'smk' },
] };
const laporan: NavSection = { title: 'Laporan', items: [
  { label: 'Laporan Sekolah', to: 'laporan', icon: FileBarChart2, perm: 'report:read' },
  { label: 'Ekspor Dapodik', to: 'dapodik', icon: Database, perm: 'dapodik:export', feature: 'dapodik' },
  { label: 'Audit Log', to: 'audit', icon: History, perm: 'audit:read' },
] };
const pengaturan: NavSection = { title: 'Pengaturan', items: [
  { label: 'Pengguna', to: 'pengguna', icon: Users, perm: 'user:read' },
  { label: 'Peran & Izin', to: 'rbac', icon: ShieldCheck, perm: 'rbac:read' },
  { label: 'Profil Lembaga', to: 'lembaga', icon: Building2, perm: 'tenant:settings' },
  { label: 'Branding', to: 'branding', icon: Palette, perm: 'tenant:settings' },
  { label: 'Fitur', to: 'fitur', icon: ToggleLeft, perm: 'feature:write' },
  { label: 'Landing Page', to: 'landing', icon: Globe, perm: 'landing:read', feature: 'landing' },
  { label: 'Pelindungan Data', to: 'pdp', icon: Lock, perm: ['pdp:review', 'pdp:self'] },
] };
const akun: NavSection = { title: 'Akun', items: [{ label: 'Profil Saya', to: 'profil', icon: KeyRound }] };

export const NAV: Record<Role, NavSection[]> = {
  SUPER_ADMIN: [
    { items: [D, AI, { label: 'Lembaga', to: 'lembaga', icon: Building2 }, { label: 'Peran & Izin Platform', to: 'rbac', icon: ShieldCheck }, { label: 'Pengguna Platform', to: 'pengguna', icon: Users }, { label: 'Fitur Global', to: 'fitur', icon: ToggleLeft }, { label: 'Portal Publik', to: 'portal', icon: Globe }, { label: 'Audit Log', to: 'audit', icon: History }, { label: 'Pekerjaan Latar', to: 'jobs', icon: Workflow }] },
    akun,
  ],
  ADMIN_SEKOLAH: [{ items: [D, AI] }, akademik, lms(), kesiswaan, komunikasi, keuangan, sarana, smk, laporan, pengaturan, akun],
  KEPSEK: [{ items: [D, AI, { label: 'Persetujuan', to: 'persetujuan', icon: ClipboardCheck }] }, lms(), { title: 'Akademik', items: akademik.items.slice(0, 7) }, kesiswaan, komunikasi, keuangan, sarana, smk, laporan, { title: 'Pengaturan', items: [{ label: 'Pengguna', to: 'pengguna', icon: Users, perm: 'user:read' }, { label: 'Pelindungan Data', to: 'pdp', icon: Lock }] }, akun],
  WAKEPSEK: [{ items: [D, AI] }, lms(), akademik, kesiswaan, komunikasi, laporan, { title: 'Pengaturan', items: [{ label: 'Pengguna', to: 'pengguna', icon: Users, perm: 'user:read' }] }, akun],
  KAPRODI: [{ items: [D, AI] }, lms(), { title: 'Program Keahlian', items: [{ label: 'Kelas & Rombel', to: 'akademik/kelas', icon: School }, { label: 'Jadwal', to: 'akademik/jadwal', icon: CalendarDays }, { label: 'Prakerin', to: 'prakerin', icon: Briefcase, feature: 'smk' }, { label: 'Uji Kompetensi', to: 'uji-kompetensi', icon: BadgeCheck, feature: 'smk' }, { label: 'Laporan', to: 'laporan', icon: FileBarChart2 }] }, komunikasi, { title: 'Lainnya', items: [{ label: 'Slip Gaji', to: 'payroll/slip', icon: Banknote, feature: 'payroll' }, { label: 'Pengguna', to: 'pengguna', icon: Users }] }, akun],
  GURU: [{ items: [D, AI, { label: 'Kelas Saya', to: 'kelas', icon: School }, { label: 'Jadwal', to: 'jadwal', icon: CalendarDays }] }, lms(), { title: 'Kesiswaan', items: [{ label: 'Izin / Sakit', to: 'absensi/izin', icon: ClipboardCheck }, { label: 'Kedisiplinan', to: 'bk/kedisiplinan', icon: Flag, perm: 'discipline:read', feature: 'bk' }, { label: 'Prestasi', to: 'prestasi', icon: Award }, { label: 'Ekstrakurikuler', to: 'ekskul', icon: Star, feature: 'ekskul' }] }, komunikasi, { title: 'Lainnya', items: [{ label: 'Slip Gaji', to: 'payroll/slip', icon: Banknote, feature: 'payroll' }, { label: 'Absensi Saya', to: 'absensi/staf', icon: CalendarCheck }, { label: 'Perpustakaan', to: 'perpustakaan', icon: Library, feature: 'library' }, { label: 'Aset', to: 'aset', icon: Boxes, feature: 'asset' }, { label: 'Prakerin', to: 'prakerin', icon: Briefcase, feature: 'smk' }, { label: 'Uji Kompetensi', to: 'uji-kompetensi', icon: BadgeCheck, feature: 'smk' }] }, akun],
  STAF: [{ items: [D, AI] }, komunikasi, { title: 'Sarana', items: [{ label: 'Aset', to: 'aset', icon: Boxes }, { label: 'Perpustakaan', to: 'perpustakaan', icon: Library }] }, { title: 'Lainnya', items: [{ label: 'Slip Gaji', to: 'payroll/slip', icon: Banknote, feature: 'payroll' }, { label: 'Absensi Saya', to: 'absensi/staf', icon: CalendarCheck }, { label: 'Pengguna', to: 'pengguna', icon: Users }] }, akun],
  BK: [{ items: [D, AI] }, { title: 'Bimbingan', items: [{ label: 'Konseling', to: 'bk/konseling', icon: HeartHandshake }, { label: 'Kedisiplinan', to: 'bk/kedisiplinan', icon: Flag }, { label: 'Izin / Sakit', to: 'absensi/izin', icon: ClipboardCheck }, { label: 'Absensi', to: 'absensi', icon: CalendarCheck }, { label: 'Nilai', to: 'nilai', icon: GraduationCap }, { label: 'Prestasi', to: 'prestasi', icon: Award }, { label: 'Siswa', to: 'pengguna', icon: Users }, { label: 'Laporan', to: 'laporan', icon: FileBarChart2 }] }, komunikasi, { title: 'Lainnya', items: [{ label: 'Slip Gaji', to: 'payroll/slip', icon: Banknote, feature: 'payroll' }, { label: 'Absensi Saya', to: 'absensi/staf', icon: CalendarCheck }] }, akun],
  KEUANGAN: [{ items: [D, AI] }, keuangan, { title: 'Lainnya', items: [{ label: 'Siswa', to: 'pengguna', icon: Users }, { label: 'Aset', to: 'aset', icon: Boxes }, { label: 'Laporan', to: 'laporan', icon: FileBarChart2 }, { label: 'Absensi Saya', to: 'absensi/staf', icon: CalendarCheck }] }, komunikasi, akun],
  AUDITOR: [{ items: [D, AI] }, laporan, lms(), keuangan, sarana, { title: 'Pengaturan', items: [{ label: 'Pengguna', to: 'pengguna', icon: Users }, { label: 'Peran & Izin', to: 'rbac', icon: ShieldCheck }] }, akun],
  SISWA: [{ items: [D, AI, { label: 'Jadwal', to: 'jadwal', icon: CalendarDays }] }, { title: 'Belajar', items: [{ label: 'Materi', to: 'materi', icon: BookOpen }, { label: 'Tugas', to: 'tugas', icon: ClipboardList }, { label: 'Kuis', to: 'kuis', icon: ListChecks }, { label: 'Ujian', to: 'ujian', icon: PenTool, feature: 'exam' }, { label: 'Nilai', to: 'nilai', icon: GraduationCap }, { label: 'Absensi', to: 'absensi', icon: CalendarCheck }, { label: 'e-Rapor', to: 'rapor', icon: BookMarked, feature: 'rapor' }, { label: 'Peta Konsep', to: 'konsep', icon: Sparkles }] }, { title: 'Sekolah', items: [{ label: 'Pengumuman', to: 'pengumuman', icon: Megaphone }, { label: 'Notifikasi', to: 'notifikasi', icon: Bell }, { label: 'Tagihan', to: 'tagihan', icon: Receipt, feature: 'finance' }, { label: 'Ekstrakurikuler', to: 'ekskul', icon: Star, feature: 'ekskul' }, { label: 'Perpustakaan', to: 'perpustakaan', icon: Library, feature: 'library' }, { label: 'Prakerin', to: 'prakerin', icon: Briefcase, feature: 'smk' }, { label: 'Uji Kompetensi', to: 'uji-kompetensi', icon: BadgeCheck, feature: 'smk' }, { label: 'Data Pribadi', to: 'pdp', icon: Lock }] }, akun],
  WALI_MURID: [{ items: [D, AI] }, { title: 'Anak Saya', items: [{ label: 'Nilai', to: 'nilai', icon: GraduationCap }, { label: 'Absensi', to: 'absensi', icon: CalendarCheck }, { label: 'Tugas', to: 'tugas', icon: ClipboardList }, { label: 'e-Rapor', to: 'rapor', icon: BookMarked, feature: 'rapor' }, { label: 'Izin / Sakit', to: 'absensi/izin', icon: ClipboardCheck }, { label: 'Tagihan', to: 'tagihan', icon: Receipt, feature: 'finance' }, { label: 'Kedisiplinan', to: 'bk/kedisiplinan', icon: Flag, feature: 'bk' }, { label: 'Prestasi', to: 'prestasi', icon: Award }] }, { title: 'Sekolah', items: [{ label: 'Pengumuman', to: 'pengumuman', icon: Megaphone }, { label: 'Notifikasi', to: 'notifikasi', icon: Bell }, { label: 'Data Pribadi', to: 'pdp', icon: Lock }] }, akun],
  CALON_SISWA: [{ items: [D, AI, { label: 'Pendaftaran Saya', to: 'ppdb', icon: UserPlus }, { label: 'Notifikasi', to: 'notifikasi', icon: Bell }] }, akun],
  PEMBIMBING_INDUSTRI: [{ items: [D, AI, { label: 'Siswa Bimbingan', to: 'prakerin', icon: Briefcase }, { label: 'Notifikasi', to: 'notifikasi', icon: Bell }] }, akun],
  PENGUJI_EKSTERNAL: [{ items: [D, AI, { label: 'Uji Kompetensi', to: 'uji-kompetensi', icon: BadgeCheck }, { label: 'Notifikasi', to: 'notifikasi', icon: Bell }] }, akun],
};
export const _icons = { Landmark, Baby, Users };
