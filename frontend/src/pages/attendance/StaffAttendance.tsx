import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { get, post, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Input, PageHeader, Table, Select } from '@/components/ui';
import { fmtDate, fmtTime, monthNow, todayStr, tone, label } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function StaffAttendance() {
  const { has, user } = useAuth();
  const admin = has('attendance:write') && user?.roles.some((r) => ['ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK'].includes(r));
  const [month, setMonth] = useState(monthNow());
  const [rows, setRows] = useState<Dict[]>([]);
  const [mine, setMine] = useState(!admin);
  const load = useCallback(() => get<Dict[]>('/attendance/staff', { month, mine: mine ? 1 : undefined }).then(setRows), [month, mine]);
  useEffect(() => { load(); }, [load]);
  const today = rows.find((r) => r.user_id === user?.id && String(r.date).slice(0, 10) === todayStr());
  const check = async (type: 'IN' | 'OUT') => { try { await post('/attendance/staff/checkin', { type }); toast.success(type === 'IN' ? 'Check-in tercatat' : 'Check-out tercatat'); load(); } catch (e) { toast.error(toApiError(e).message); } };
  const [bulk, setBulk] = useState<{ user_id: string; status: string }[]>([]);
  const [staff, setStaff] = useState<Dict[]>([]);
  const [date, setDate] = useState(todayStr());
  useEffect(() => { if (admin && !mine) get<unknown>('/users', { limit: 200, role: 'GURU' }).then((d) => setStaff((d as { data?: Dict[] }).data ?? [])); }, [admin, mine]);
  const saveBulk = async () => { if (!bulk.length) return; try { await post('/attendance/staff', { records: bulk.map((b) => ({ ...b, date })) }); toast.success('Tersimpan'); setBulk([]); load(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <div>
      <PageHeader title="Absensi Staf / Guru" actions={<div className="flex gap-2"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />{admin && <Select value={mine ? '1' : '0'} onChange={(e) => setMine(e.target.value === '1')} options={[{ value: '1', label: 'Saya' }, { value: '0', label: 'Semua staf' }]} />}</div>} />
      <Card className="mb-4"><div className="flex flex-wrap items-center gap-4"><div><div className="text-xs text-ink-3">Hari ini · {fmtDate(todayStr(), 'EEEE, d MMM')}</div><div className="text-lg font-semibold">{today ? `Masuk ${fmtTime(today.check_in as string)}${today.check_out ? ` · Pulang ${fmtTime(today.check_out as string)}` : ''}` : 'Belum check-in'}</div></div><div className="ml-auto flex gap-2"><Button icon={<LogIn className="h-4 w-4" />} disabled={!!today?.check_in} onClick={() => check('IN')}>Check-in</Button><Button variant="outline" icon={<LogOut className="h-4 w-4" />} disabled={!today?.check_in || !!today?.check_out} onClick={() => check('OUT')}>Check-out</Button></div></div></Card>
      {admin && !mine && <Card className="mb-4" title="Input massal" action={<div className="flex gap-2"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /><Button size="sm" onClick={saveBulk} disabled={!bulk.length}>Simpan ({bulk.length})</Button></div>}><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{staff.map((s) => { const cur = bulk.find((b) => b.user_id === s.id)?.status ?? ''; return <div key={s.id as string} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="truncate">{s.full_name as string}</span><Select value={cur} onChange={(e) => setBulk((b) => [...b.filter((x) => x.user_id !== s.id), ...(e.target.value ? [{ user_id: s.id as string, status: e.target.value }] : [])])} className="w-28" placeholder="—" options={['HADIR', 'SAKIT', 'IZIN', 'ALPA', 'CUTI', 'DINAS'].map((x) => ({ value: x, label: x }))} /></div>; })}</div></Card>}
      <Card padded={false}><Table<Dict> rows={rows} rowKey={(r) => r.id as string} columns={[{ key: 'date', header: 'Tanggal', render: (r) => fmtDate(r.date as string, 'EEE, d MMM') }, ...(mine ? [] : [{ key: 'full_name', header: 'Nama' }]), { key: 'check_in', header: 'Masuk', render: (r) => fmtTime(r.check_in as string) }, { key: 'check_out', header: 'Pulang', render: (r) => fmtTime(r.check_out as string) }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'HADIR' ? 'green' : tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'note', header: 'Catatan' }]} empty="Belum ada data" /></Card>
    </div>
  );
}
