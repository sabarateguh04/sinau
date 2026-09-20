import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useResource } from '@/features/crud/CrudPage';
import { Button, Card, EmptyState, PageHeader, Pagination, cx } from '@/components/ui';
import { fmtAgo } from '@/lib/format';
import { Notification } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { rewriteLink } from '@/layouts/AppShell';
import { useState } from 'react';

export default function Notifications() {
  const [page, setPage] = useState(1);
  const { rows, meta, loading, reload } = useResource<Notification>('/notifications', { page, limit: 30 });
  const nav = useNavigate();
  const { activeRole } = useAuth();
  const open = async (n: Notification) => { if (!n.read_at) { await api.post('/notifications/read', { ids: [n.id] }); reload(); } if (n.link) nav(rewriteLink(n.link, activeRole)); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifikasi" actions={<Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={async () => { await api.post('/notifications/read', { all: true }); reload(); }}>Tandai semua dibaca</Button>} />
      <Card padded={false}>
        {!loading && rows.length === 0 ? <div className="p-6"><EmptyState title="Belum ada notifikasi" icon={<Bell className="h-6 w-6" />} /></div> : (
          <ul className="divide-y divide-line">{rows.map((n) => <li key={n.id}><button onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.read_at && 'bg-brand-50/50 dark:bg-brand-900/10')}><span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand-600')} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{n.title}</span>{n.body && <span className="block text-sm text-ink-2">{n.body}</span>}<span className="text-[11px] text-ink-3">{n.type} · {fmtAgo(n.created_at)}</span></span></button></li>)}</ul>
        )}
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
    </div>
  );
}
