import { Me, Role } from '@/lib/types';
import { tokens } from '@/lib/api';

/** Preferred landing role after login (saved choice first, then the most capable role). */
export function pickRole(me: Me): Role {
  const saved = tokens.role as Role | null;
  if (saved && me.roles.includes(saved)) return saved;
  const order: Role[] = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'KAPRODI', 'KEUANGAN', 'BK', 'GURU', 'STAF', 'AUDITOR', 'WALI_MURID', 'SISWA', 'PEMBIMBING_INDUSTRI', 'PENGUJI_EKSTERNAL', 'CALON_SISWA'];
  return order.find((r) => me.roles.includes(r)) ?? me.roles[0];
}
