import { useState } from 'react';
import { useResource } from '@/features/crud/CrudPage';
import { Badge, Card, Input, PageHeader, Pagination, Table, useDebounce } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function AuditLog() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const da = useDebounce(action); const de = useDebounce(entity);
  const { rows, meta, loading } = useResource<Dict>('/audit', { action: da || undefined, entity: de || undefined, page, limit: 40 });
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Jejak aksi tulis penting: siapa, apa, kapan." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3"><Input placeholder="Aksi (mis. user.create)" value={action} onChange={(e) => setAction(e.target.value)} className="w-56" /><Input placeholder="Entitas (mis. users)" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-48" /></div>
        <Table<Dict> loading={loading} rows={rows} dense columns={[
          { key: 'created_at', header: 'Waktu', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at as string)}</span> },
          { key: 'user_name', header: 'Pengguna', render: (r) => (r.user_name as string) ? <span>{r.user_name as string}<span className="block text-[10px] text-ink-3">@{r.username as string}</span></span> : <span className="text-ink-3">sistem</span> },
          { key: 'action', header: 'Aksi', render: (r) => <Badge tone={/delete|reject|deactivate/.test(r.action as string) ? 'red' : /create|approve|activate/.test(r.action as string) ? 'green' : 'gray'}>{r.action as string}</Badge> },
          { key: 'entity', header: 'Entitas', render: (r) => <span className="text-xs">{r.entity as string}{r.entity_id ? <span className="block font-mono text-[10px] text-ink-3">{String(r.entity_id).slice(0, 8)}…</span> : null}</span> },
          { key: 'after_data', header: 'Detail', render: (r) => { const d = r.after_data ?? r.before_data; const s = d ? (typeof d === 'string' ? d : JSON.stringify(d)) : ''; return <span className="line-clamp-1 max-w-md font-mono text-[11px] text-ink-2" title={s}>{s.slice(0, 160)}</span>; } },
          { key: 'ip', header: 'IP', render: (r) => <span className="text-[11px] text-ink-3">{r.ip as string}</span> },
        ]} />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
    </div>
  );
}
