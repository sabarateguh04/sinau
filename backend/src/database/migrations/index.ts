import { Migration } from './ddl';
import { m0001 } from './0001_platform';
import { m0002 } from './0002_academic';
import { m0003 } from './0003_lms';
import { m0004 } from './0004_attendance';
import { m0005 } from './0005_exams_rapor';
import { m0006 } from './0006_kesiswaan_finance';
import { m0007 } from './0007_assets_ppdb_smk';
import { m0008 } from './0008_landing_dashboard';

/** Ordered list. New schema changes go into a NEW migration file (never edit an applied one). */
export const migrations: Migration[] = [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008];
