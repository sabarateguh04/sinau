import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const toDate = (v: string | Date | null | undefined) => { if (!v) return null; const d = typeof v === 'string' ? parseISO(v) : v; return isValid(d) ? d : null; };
export const fmtDate = (v: string | Date | null | undefined, f = 'd MMM yyyy') => { const d = toDate(v); return d ? format(d, f, { locale: localeId }) : '-'; };
export const fmtDateTime = (v: string | Date | null | undefined) => fmtDate(v, 'd MMM yyyy HH:mm');
export const fmtTime = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : '-');
export const fmtAgo = (v: string | Date | null | undefined) => { const d = toDate(v); return d ? formatDistanceToNow(d, { addSuffix: true, locale: localeId }) : '-'; };
export const fmtMoney = (v: number | string | null | undefined) => `Rp ${Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
export const fmtNum = (v: number | string | null | undefined, digits = 0) => Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: digits });
export const fmtScore = (v: number | string | null | undefined) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }));
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const toInputDateTime = (v: string | null | undefined) => { const d = toDate(v); return d ? format(d, "yyyy-MM-dd'T'HH:mm") : ''; };
export const toInputDate = (v: string | null | undefined) => { const d = toDate(v); return d ? format(d, 'yyyy-MM-dd') : ''; };
export const monthNow = () => format(new Date(), 'yyyy-MM');
export const todayStr = () => format(new Date(), 'yyyy-MM-dd');
export const ATT_LABEL: Record<string, string> = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa', T: 'Terlambat' };
export const ATT_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'purple'> = { H: 'green', S: 'amber', I: 'blue', A: 'red', T: 'purple' };
export const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'brand' | 'purple'> = {
  DRAFT: 'gray', PUBLISHED: 'green', CLOSED: 'red', SUBMITTED: 'blue', GRADED: 'green', RETURNED: 'amber', IN_PROGRESS: 'blue', EXPIRED: 'red', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red',
  AKTIF: 'green', PINDAH: 'amber', LULUS: 'brand', KELUAR: 'red', UNPAID: 'red', PARTIAL: 'amber', PAID: 'green', OVERDUE: 'red', SCHEDULED: 'blue', ONGOING: 'green', FINISHED: 'gray', NONE: 'gray',
  VERIFIED: 'blue', ACCEPTED: 'green', WAITLIST: 'amber', ENROLLED: 'brand', CONFIRMED: 'green', CANCELLED: 'red', BORROWED: 'blue', RETURNED_BOOK: 'green', LATE: 'red', PLANNED: 'gray', DONE: 'green', FAILED: 'red', RUNNING: 'blue',
  FINANCE_APPROVED: 'blue', PRINCIPAL_APPROVED: 'green', PAID_OUT: 'brand', VALIDATED: 'blue', COMPETENT: 'green', NOT_COMPETENT: 'red', OPEN: 'blue',
};
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf', PUBLISHED: 'Terbit', CLOSED: 'Ditutup', SUBMITTED: 'Dikumpulkan', GRADED: 'Dinilai', RETURNED: 'Dikembalikan', IN_PROGRESS: 'Berjalan', EXPIRED: 'Waktu habis', PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak',
  AKTIF: 'Aktif', PINDAH: 'Pindah', LULUS: 'Lulus', KELUAR: 'Keluar', UNPAID: 'Belum bayar', PARTIAL: 'Sebagian', PAID: 'Lunas', OVERDUE: 'Terlambat', SCHEDULED: 'Terjadwal', ONGOING: 'Berlangsung', FINISHED: 'Selesai', NONE: 'Belum',
  VERIFIED: 'Terverifikasi', ACCEPTED: 'Diterima', WAITLIST: 'Cadangan', ENROLLED: 'Terdaftar', CONFIRMED: 'Terkonfirmasi', CANCELLED: 'Dibatalkan', BORROWED: 'Dipinjam', LATE: 'Terlambat', PLANNED: 'Rencana', DONE: 'Selesai', FAILED: 'Gagal', RUNNING: 'Berjalan',
  FINANCE_APPROVED: 'Disetujui keuangan', PRINCIPAL_APPROVED: 'Disetujui kepsek', PAID_OUT: 'Dibayarkan', VALIDATED: 'Tervalidasi', COMPETENT: 'Kompeten', NOT_COMPETENT: 'Belum kompeten', OPEN: 'Terbuka', ACTIVE: 'Aktif',
};
export const label = (s: string | null | undefined) => (s ? STATUS_LABEL[s] ?? s : '-');
export const tone = (s: string | null | undefined) => (s ? STATUS_TONE[s] ?? 'gray' : 'gray');
export const QUESTION_TYPE_LABEL: Record<string, string> = { MC: 'Pilihan ganda', MCX: 'PG kompleks', TF: 'Benar/Salah', SHORT: 'Isian singkat', MATCH: 'Menjodohkan', ESSAY: 'Esai' };
export const initials = (name: string) => name.split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
