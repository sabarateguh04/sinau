import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Play, ShieldCheck, Undo2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { get, post, del, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, cx } from '@/components/ui';
import { fmtDateTime, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

const STEPS = ['DRAFT', 'CHECKED', 'DRY_RUN', 'EXECUTED'];
export default function Rollover() {
  const [runs, setRuns] = useState<Dict[] | null>(null);
  const [sel, setSel] = useState<Dict | null>(null);
  const [wizard, setWizard] = useState(false);
  const load = useCallback(() => get<Dict[]>('/rollover/runs').then(setRuns), []);
  useEffect(() => { load(); }, [load]);
  if (!runs) return <Loading />;
  return (
    <div>
      <PageHeader title="Tutup Tahun Ajaran" subtitle="Kenaikan kelas, kelulusan → alumni, penyalinan penugasan guru ke tahun baru. Draft → pre-check → dry-run → eksekusi, bisa rollback." actions={<Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => setWizard(true)}>Rencana baru</Button>} />
      {runs.length === 0 ? <EmptyState title="Belum ada rencana tutup tahun" action={<Button onClick={() => setWizard(true)}>Buat rencana</Button>} /> : <Card padded={false}><Table<Dict> rows={runs} onRowClick={(r) => setSel(r)} columns={[{ key: 'from_year', header: 'Dari' }, { key: 'to_year', header: 'Ke' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'EXECUTED' ? 'green' : r.status === 'ROLLED_BACK' ? 'red' : 'blue'}>{r.status as string}</Badge> }, { key: 'result', header: 'Hasil dry-run', render: (r) => { const x = r.result as Dict | null; return x ? `${x.classes} kelas · ${x.promoted} naik · ${x.graduated} lulus · ${x.repeated} tinggal` : '-'; } }, { key: 'created_by_name', header: 'Oleh' }, { key: 'executed_at', header: 'Dieksekusi', render: (r) => r.executed_at ? fmtDateTime(r.executed_at as string) : '-' }]} /></Card>}
      <Wizard open={wizard} onClose={() => setWizard(false)} onDone={(r) => { setWizard(false); load(); setSel(r); }} />
      <RunModal run={sel} onClose={() => setSel(null)} onChange={load} />
    </div>
  );
}
function Wizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: Dict) => void }) {
  const [s, setS] = useState<Dict | null>(null);
  const [plan, setPlan] = useState<Dict[]>([]);
  const [toYear, setToYear] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) get<Dict>('/rollover/suggest').then((d) => { setS(d); setPlan(d.plan as Dict[]); setToYear(d.suggested_to_year_name as string); }).catch((e) => toast.error(toApiError(e).message)); }, [open]);
  const submit = async () => { setBusy(true); try { const r = await post<Dict>('/rollover/runs', { to_year_name: toYear, plan: plan.map((p) => ({ class_id: p.class_id, action: p.action, target_class_name: p.target_class_name || null, target_grade_level: p.target_grade_level ? Number(p.target_grade_level) : null, homeroom_teacher_id: p.homeroom_teacher_id || null })) }); toast.success('Rencana dibuat'); onDone(r); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Rencana tutup tahun ajaran" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={submit}>Simpan rencana</Button></>}>
      {!s ? <Loading /> : <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3"><Field label="Dari tahun ajaran"><Input disabled value={(s.from_year as Dict).name as string} /></Field><Field label="Ke tahun ajaran (dibuat jika belum ada)"><Input value={toYear} onChange={(e) => setToYear(e.target.value)} /></Field></div>
        <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="px-3 py-2">Kelas</th><th className="px-3 py-2">Siswa</th><th className="px-3 py-2">Rapor S2 sah</th><th className="px-3 py-2">Aksi</th><th className="px-3 py-2">Kelas tujuan</th><th className="px-3 py-2">Tingkat</th></tr></thead><tbody>{plan.map((p, i) => <tr key={p.class_id as string} className="border-t border-line"><td className="px-3 py-2 font-medium">{p.class_name as string}</td><td className="px-3 py-2">{p.students as number}{Number(p.held_back) > 0 && <Badge tone="amber" className="ml-1">{p.held_back as number} tinggal</Badge>}</td><td className="px-3 py-2">{p.approved_cards as number}/{p.students as number}</td><td className="px-3 py-2"><Select className="w-36" value={String(p.action)} onChange={(e) => setPlan((a) => a.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} options={[{ value: 'PROMOTE', label: 'Naik kelas' }, { value: 'GRADUATE', label: 'Lulus' }, { value: 'REPEAT', label: 'Tinggal (semua)' }, { value: 'SKIP', label: 'Lewati' }]} /></td><td className="px-3 py-2"><Input disabled={p.action === 'GRADUATE' || p.action === 'SKIP'} className="h-9" value={String(p.target_class_name ?? '')} onChange={(e) => setPlan((a) => a.map((x, j) => (j === i ? { ...x, target_class_name: e.target.value } : x)))} /></td><td className="px-3 py-2"><Input disabled={p.action === 'GRADUATE' || p.action === 'SKIP'} type="number" className="h-9 w-20" value={String(p.target_grade_level ?? '')} onChange={(e) => setPlan((a) => a.map((x, j) => (j === i ? { ...x, target_grade_level: e.target.value } : x)))} /></td></tr>)}</tbody></table></div>
        <p className="text-xs text-ink-3">Siswa dengan keputusan "tidak naik" di rapor semester 2 otomatis ditahan (perlu penempatan manual setelah eksekusi). Penugasan guru×mapel disalin ke kelas baru.</p>
      </div>}
    </Modal>
  );
}
function RunModal({ run, onClose, onChange }: { run: Dict | null; onClose: () => void; onChange: () => void }) {
  const [d, setD] = useState<Dict | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { if (run) get<Dict>(`/rollover/runs/${run.id}`).then(setD); else setD(null); }, [run]);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string) => { if (action === 'execute' && !confirm('Eksekusi sekarang? Tahun ajaran baru akan diaktifkan dan kelas lama dinonaktifkan.')) return; if (action === 'rollback' && !confirm('Batalkan hasil eksekusi (rollback)?')) return; setBusy(action); try { const r = await post<Dict>(`/rollover/runs/${run!.id}/${action}`); toast.success(action === 'check' ? (r.ok ? 'Pre-check lolos' : 'Ada error pada pre-check') : action === 'dry-run' ? `Dry-run: ${r.classes} kelas, ${r.promoted} naik, ${r.graduated} lulus, ${r.repeated} tinggal` : action === 'execute' ? 'Tahun ajaran baru aktif!' : 'Rollback selesai'); load(); onChange(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(''); } };
  if (!run) return null;
  const status = String(d?.status ?? run.status);
  const idx = STEPS.indexOf(status);
  return (
    <Modal open={!!run} onClose={onClose} size="xl" title={`${run.from_year} → ${run.to_year}`} footer={<div className="flex flex-wrap gap-2">{status === 'DRAFT' && <Button variant="ghost" className="text-red-600" onClick={async () => { await del(`/rollover/runs/${run.id}`); onChange(); onClose(); }}>Hapus</Button>}{['DRAFT', 'CHECKED', 'DRY_RUN'].includes(status) && <Button variant="outline" loading={busy === 'check'} icon={<ShieldCheck className="h-4 w-4" />} onClick={() => act('check')}>Pre-check</Button>}{['CHECKED', 'DRY_RUN'].includes(status) && <Button variant="outline" loading={busy === 'dry-run'} icon={<RefreshCw className="h-4 w-4" />} onClick={() => act('dry-run')}>Dry-run</Button>}{status === 'DRY_RUN' && <Button variant="accent" loading={busy === 'execute'} icon={<Play className="h-4 w-4" />} onClick={() => act('execute')}>Eksekusi</Button>}{status === 'EXECUTED' && <Button variant="danger" loading={busy === 'rollback'} icon={<Undo2 className="h-4 w-4" />} onClick={() => act('rollback')}>Rollback</Button>}</div>}>
      {!d ? <Loading /> : <div className="space-y-4">
        <ol className="flex flex-wrap gap-2">{STEPS.map((s, i) => <li key={s} className={cx('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', i <= idx ? 'bg-brand-700 text-white' : 'bg-surface-3 text-ink-3')}>{i < idx ? <CheckCircle2 className="h-3 w-3" /> : null}{s}</li>)}{status === 'ROLLED_BACK' && <li className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">ROLLED_BACK</li>}</ol>
        {Array.isArray(d.checks) && <Card title="Hasil pre-check"><ul className="space-y-1 text-sm">{(d.checks as Dict[]).map((c, i) => <li key={i} className="flex items-start gap-2">{c.level === 'OK' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <AlertTriangle className={cx('mt-0.5 h-4 w-4', c.level === 'ERROR' ? 'text-red-500' : 'text-amber-500')} />}<span><b>{c.class_name as string}</b> — {c.message as string}</span></li>)}</ul></Card>}
        {(d.items as Dict[]).length > 0 && <Card padded={false} title={`Rincian (${(d.items as Dict[]).length})`}><div className="max-h-80 overflow-y-auto"><Table<Dict> dense rows={d.items as Dict[]} columns={[{ key: 'kind', header: 'Jenis' }, { key: 'action', header: 'Aksi', render: (r) => <Badge tone={r.action === 'GRADUATE' ? 'brand' : r.action === 'HOLD' ? 'amber' : r.action === 'CREATE_CLASS' ? 'blue' : 'green'}>{r.action as string}</Badge> }, { key: 'detail', header: 'Detail', render: (r) => { const x = r.detail as Dict; return x.name ? <span>{x.name as string}{x.from_class ? <span className="text-xs text-ink-3"> · {x.from_class as string}{x.to_class ? ` → ${x.to_class}` : ''}</span> : x.grade_level ? <span className="text-xs text-ink-3"> · tingkat {x.grade_level as number}</span> : null}</span> : JSON.stringify(x); } }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }]} /></div></Card>}
      </div>}
    </Modal>
  );
}
