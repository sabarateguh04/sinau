import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Link2, Video, Plus, Eye, Upload, Globe } from 'lucide-react';
import { get, post, put, toApiError, uploadFile } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Switch, Tabs, Textarea, useDebounce, Progress, cx } from '@/components/ui';
import { fmtAgo, fmtBytes } from '@/lib/format';
import { Dict } from '@/lib/types';

const ICON: Record<string, typeof BookOpen> = { FILE: FileText, VIDEO: Video, LINK: Link2, TEXT: BookOpen };
const TYPE_LABEL: Record<string, string> = { FILE: 'Berkas', VIDEO: 'Video', LINK: 'Tautan', TEXT: 'Teks' };

export default function Materials() {
  const { has, activeRole, user } = useAuth();
  const nav = useNavigate();
  const p = rolePrefix(activeRole);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [tab, setTab] = useState<'all' | 'mine' | 'draft'>('all');
  const [cs, setCs] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Dict | null | 'new'>(null);
  const canWrite = has('material:write');
  const params = useMemo(() => ({ q: dq || undefined, page, limit: 18, mine: tab === 'mine' ? 1 : undefined, published: tab === 'draft' ? 0 : undefined, class_subject_id: cs || undefined, type: type || undefined }), [dq, page, tab, cs, type]);
  const { rows, meta, loading, reload } = useResource<Dict>('/materials', params);
  useEffect(() => setPage(1), [dq, tab, cs, type]);
  const teaching = user?.teaching ?? [];
  const classes = user?.classes ?? [];
  return (
    <div>
      <PageHeader title="Materi" subtitle={canWrite ? 'Bahan ajar untuk kelas yang Anda ampu.' : 'Bahan ajar dari guru kelas Anda.'} actions={canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen('new')}>Buat materi</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} className="w-full sm:w-64" placeholder="Cari judul…" />
        {canWrite && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Semua' }, { value: 'mine', label: 'Milik saya' }, { value: 'draft', label: 'Draf' }]} />}
        {teaching.length > 0 && <Select value={cs} onChange={(e) => setCs(e.target.value)} className="w-56" placeholder="Semua kelas/mapel" options={teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} />}
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-36" placeholder="Semua tipe" options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      {!loading && rows.length === 0 ? <EmptyState title="Belum ada materi" description={canWrite ? 'Mulai dengan mengunggah berkas, menempel tautan video, atau menulis materi.' : 'Guru belum menerbitkan materi untuk kelas Anda.'} action={canWrite && <Button onClick={() => setOpen('new')}>Buat materi</Button>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => { const I = ICON[m.type as string] ?? BookOpen; return (
            <Link key={m.id as string} to={`/${p}/materi/${m.id}`} className={cx('card group flex flex-col p-4 transition hover:border-brand-400', !m.is_published && 'border-dashed')}>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs text-ink-3"><I className="h-4 w-4 text-brand-700" />{TYPE_LABEL[m.type as string]}</span><span className="flex gap-1">{!m.is_published && <Badge tone="gray">Draf</Badge>}{m.is_public ? <Badge tone="blue"><Globe className="h-3 w-3" /></Badge> : null}</span></div>
              <div className="mt-2 line-clamp-2 font-semibold group-hover:text-brand-700">{m.title as string}</div>
              <div className="mt-1 line-clamp-2 text-sm text-ink-2">{(m.description as string) || ' '}</div>
              <div className="mt-auto pt-3 text-[11px] text-ink-3">{(m.class_name as string) ? `${m.class_name} · ` : ''}{m.subject_name as string}{m.author_name ? ` · ${m.author_name}` : ''} · {fmtAgo(m.published_at as string || m.created_at as string)}</div>
              {typeof m.my_progress === 'number' ? <Progress value={m.my_progress as number} className="mt-2" tone={Number(m.my_progress) >= 100 ? 'green' : 'brand'} /> : canWrite ? <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-3"><Eye className="h-3 w-3" /> {m.reader_count as number} pembaca · {m.view_count as number} dilihat</div> : null}
            </Link>
          ); })}
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      {canWrite && <MaterialForm open={open !== null} row={open === 'new' ? null : open} onClose={() => setOpen(null)} onSaved={(m) => { setOpen(null); reload(); nav(`/${p}/materi/${m.id}`); }} teaching={teaching} classes={classes} />}
    </div>
  );
}

export function MaterialForm({ open, row, onClose, onSaved, teaching }: { open: boolean; row: Dict | null; onClose: () => void; onSaved: (m: Dict) => void; teaching: { class_subject_id: string; class_name: string; subject_name: string }[]; classes?: unknown[] }) {
  const { hasRole } = useAuth();
  const [f, setF] = useState<Dict>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [majors, setMajors] = useState<Dict[]>([]);
  const general = hasRole('ADMIN_SEKOLAH', 'WAKEPSEK', 'KAPRODI', 'KEPSEK');
  useEffect(() => { if (!open) return; setF(row ? { ...row } : { type: 'FILE', title: '', description: '', class_subject_id: teaching[0]?.class_subject_id ?? '', content_url: '', content_text: '', is_published: false, is_public: false, subject_id: '', major_id: '', grade_level: '' }); setFile(null); if (general) { get<{ data: Dict[] }>('/academic/subjects', { limit: 200 }).then((d) => setSubjects((d as unknown as { data?: Dict[] }).data ?? [])).catch(() => undefined); get<unknown>('/academic/majors', { limit: 100 }).then((d) => setMajors((d as { data?: Dict[] }).data ?? [])).catch(() => undefined); } }, [open, row, teaching, general]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async (publish?: boolean) => {
    setBusy(true);
    try {
      let file_id = f.file_id as string | undefined;
      if (f.type === 'FILE' && file) { const up = await uploadFile('materials', file); file_id = up.id; }
      const body: Dict = { title: f.title, description: f.description || null, type: f.type, class_subject_id: f.class_subject_id || null, subject_id: f.subject_id || null, major_id: f.major_id || null, grade_level: f.grade_level ? Number(f.grade_level) : null, content_url: f.content_url || null, content_text: f.content_text || null, file_id: file_id ?? null, is_published: publish ?? !!f.is_published, is_public: !!f.is_public };
      const saved = row ? await put<Dict>(`/materials/${row.id}`, body) : await post<Dict>('/materials', body);
      toast.success(row ? 'Materi diperbarui' : publish ? 'Materi diterbitkan' : 'Draf disimpan');
      onSaved(saved);
    } catch (e) { toast.error('Gagal menyimpan', toApiError(e).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={row ? 'Ubah materi' : 'Materi baru'} footer={<><Button variant="outline" onClick={onClose}>Batal</Button>{!row && <Button variant="secondary" loading={busy} onClick={() => save(false)}>Simpan draf</Button>}<Button loading={busy} onClick={() => save(row ? undefined : true)}>{row ? 'Simpan' : 'Terbitkan'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Judul" required className="sm:col-span-2"><Input value={String(f.title ?? '')} onChange={(e) => set('title', e.target.value)} placeholder="mis. Pengenalan Model OSI" /></Field>
        <Field label="Untuk kelas & mapel" hint={general ? 'Kosongkan untuk materi umum (semua kelas sesuai jurusan/tingkat)' : undefined}><Select value={String(f.class_subject_id ?? '')} onChange={(e) => set('class_subject_id', e.target.value)} placeholder={general ? '— Materi umum —' : '— pilih —'} options={teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} /></Field>
        <Field label="Tipe"><Select value={String(f.type)} onChange={(e) => set('type', e.target.value)} options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} /></Field>
        {general && !f.class_subject_id && <>
          <Field label="Mata pelajaran"><Select value={String(f.subject_id ?? '')} onChange={(e) => set('subject_id', e.target.value)} placeholder="—" options={subjects.map((s) => ({ value: s.id as string, label: s.name as string }))} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Jurusan"><Select value={String(f.major_id ?? '')} onChange={(e) => set('major_id', e.target.value)} placeholder="Semua" options={majors.map((m) => ({ value: m.id as string, label: m.code as string }))} /></Field><Field label="Tingkat"><Select value={String(f.grade_level ?? '')} onChange={(e) => set('grade_level', e.target.value)} placeholder="Semua" options={[10, 11, 12].map((g) => ({ value: g, label: `Kelas ${g}` }))} /></Field></div>
        </>}
        <Field label="Deskripsi" className="sm:col-span-2"><Textarea rows={2} value={String(f.description ?? '')} onChange={(e) => set('description', e.target.value)} /></Field>
        {f.type === 'FILE' && <Field label="Berkas (PDF, PPTX, DOCX, gambar ≤ 20 MB)" className="sm:col-span-2"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-4 hover:border-brand-400"><Upload className="h-5 w-5 text-ink-3" /><span className="text-sm text-ink-2">{file ? `${file.name} (${fmtBytes(file.size)})` : row?.file_name ? `Saat ini: ${row.file_name}` : 'Pilih berkas…'}</span><input type="file" className="hidden" accept=".pdf,.pptx,.ppt,.docx,.doc,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.mp4,.mp3" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label></Field>}
        {(f.type === 'VIDEO' || f.type === 'LINK') && <Field label={f.type === 'VIDEO' ? 'Tautan video (YouTube / mp4)' : 'Tautan'} className="sm:col-span-2"><Input value={String(f.content_url ?? '')} onChange={(e) => set('content_url', e.target.value)} placeholder="https://" /></Field>}
        {f.type === 'TEXT' && <Field label="Isi materi (Markdown)" hint="# Judul, **tebal**, - daftar, ``` kode" className="sm:col-span-2"><Textarea rows={12} className="font-mono text-sm" value={String(f.content_text ?? '')} onChange={(e) => set('content_text', e.target.value)} /></Field>}
        {row && <Field label="Status"><div className="pt-2"><Switch checked={!!f.is_published} onChange={(v) => set('is_published', v)} label={f.is_published ? 'Terbit' : 'Draf'} /></div></Field>}
        <Field label="Boleh dibagikan ke portal publik" hint="Admin/Super Admin yang memutuskan tampil di portal"><div className="pt-2"><Switch checked={!!f.is_public} onChange={(v) => set('is_public', v)} label={f.is_public ? 'Ya' : 'Tidak'} /></div></Field>
      </div>
    </Modal>
  );
}
