import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Eye, EyeOff, Users } from 'lucide-react';
import { get, post, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Confirm, Loading, Table, Progress } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { Dict } from '@/lib/types';
import { MaterialBody } from './MaterialBody';
import { MaterialForm } from './Materials';

export default function MaterialDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, has } = useAuth();
  const [m, setM] = useState<Dict | null>(null);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => get<Dict>(`/materials/${id}`).then(setM).catch((e) => { toast.error(toApiError(e).message); nav(-1); }), [id, nav]);
  useEffect(() => { load(); }, [load]);
  const progress = useCallback((p: number) => { if (user?.roles.includes('SISWA')) post(`/materials/${id}/progress`, { progress: p }).catch(() => undefined); }, [id, user]);
  useEffect(() => { const t = setTimeout(() => progress(25), 4000); return () => clearTimeout(t); }, [progress]);
  if (!m) return <Loading />;
  const mine = m.is_mine || has('material:publish') || user?.is_super_admin;
  const canEdit = has('material:write') && mine;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
        {canEdit && <div className="flex gap-1">
          <Button size="sm" variant="outline" icon={m.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onClick={async () => { await post(`/materials/${id}/publish`); load(); }}>{m.is_published ? 'Jadikan draf' : 'Terbitkan'}</Button>
          <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Ubah</Button>
          <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)} />
        </div>}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-3"><Badge tone="brand">{m.type as string}</Badge>{!m.is_published && <Badge tone="gray">Draf</Badge>}<span>{m.class_name ? `${m.class_name} · ` : ''}{m.subject_name as string}</span><span>· {m.author_name as string}</span><span>· {fmtDateTime((m.published_at ?? m.created_at) as string)}</span></div>
      <h1 className="text-2xl font-bold sm:text-3xl">{m.title as string}</h1>
      {m.description ? <p className="mt-2 text-ink-2">{m.description as string}</p> : null}
      <div className="mt-6"><MaterialBody m={m} onProgress={progress} /></div>
      {Array.isArray(m.readers) && (
        <Card className="mt-8" title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> Jejak baca siswa ({(m.readers as Dict[]).length})</span>}>
          <Table<Dict> dense columns={[{ key: 'full_name', header: 'Siswa' }, { key: 'view_count', header: 'Dibuka', className: 'text-center' }, { key: 'progress', header: 'Progres', render: (r) => <div className="flex items-center gap-2"><Progress value={Number(r.progress)} className="w-24" /><span className="text-xs">{r.progress as number}%</span></div> }, { key: 'last_viewed_at', header: 'Terakhir', render: (r) => fmtDateTime(r.last_viewed_at as string) }]} rows={m.readers as Dict[]} rowKey={(r) => r.user_id as string} empty="Belum ada siswa yang membuka" />
        </Card>
      )}
      {canEdit && <MaterialForm open={edit} row={m} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} teaching={user?.teaching ?? []} />}
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={async () => { await del(`/materials/${id}`); toast.success('Materi dihapus'); nav(-1); }} title="Hapus materi?" />
    </div>
  );
}
