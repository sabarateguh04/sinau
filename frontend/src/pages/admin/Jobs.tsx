import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { get } from '@/lib/api';
import { Badge, Button, Card, PageHeader, Table } from '@/components/ui';
import { fmtDateTime, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Jobs() {
  const [rows, setRows] = useState<Dict[]>([]);
  const load = () => get<Dict[]>('/jobs').then(setRows);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, []);
  return (
    <div>
      <PageHeader title="Pekerjaan Latar" subtitle="Pengingat harian, denda keterlambatan, retensi data, ekspor. Diproses oleh worker internal." actions={<Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={load}>Muat ulang</Button>} />
      <Card padded={false}><Table<Dict> dense rows={rows} columns={[{ key: 'type', header: 'Jenis', render: (r) => <code className="text-xs">{r.type as string}</code> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'attempts', header: 'Percobaan', className: 'text-center' }, { key: 'run_at', header: 'Dijadwalkan', render: (r) => fmtDateTime(r.run_at as string) }, { key: 'finished_at', header: 'Selesai', render: (r) => r.finished_at ? fmtDateTime(r.finished_at as string) : '-' }, { key: 'result', header: 'Hasil / error', render: (r) => <span className="line-clamp-1 max-w-md font-mono text-[11px] text-ink-2">{r.error ? String(r.error) : r.result ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result)) : ''}</span> }]} empty="Belum ada pekerjaan" /></Card>
    </div>
  );
}
