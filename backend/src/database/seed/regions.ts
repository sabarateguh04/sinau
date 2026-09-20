import { T } from '../../config';
import { execute, queryOne } from '../db';
import { INDONESIA_REGIONS, REGION_TOTALS } from '../data/indonesiaRegions';
import { logger } from '../../core/logger';

/** 38 provinsi + 514 kabupaten/kota (kode BPS). id = Number(kode). Count-guarded: skipped when complete. */
export async function seedRegions(): Promise<void> {
  const c = await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('provinsi')}\`) AS p, (SELECT COUNT(*) FROM \`${T('kota')}\`) AS k`);
  if (Number(c?.p) >= REGION_TOTALS.provinsi && Number(c?.k) >= REGION_TOTALS.kota) return;
  for (const p of INDONESIA_REGIONS) {
    await execute(`INSERT IGNORE INTO \`${T('provinsi')}\` (id, kode, nama) VALUES (?,?,?)`, [Number(p.kode), p.kode, p.nama]);
    const values: unknown[] = [];
    const marks = p.kota.map(([kode, nama]) => { values.push(Number(kode), Number(p.kode), kode, nama); return '(?,?,?,?)'; });
    if (marks.length) await execute(`INSERT IGNORE INTO \`${T('kota')}\` (id, provinsi_id, kode, nama) VALUES ${marks.join(',')}`, values);
  }
  logger.info('regions seeded');
}
