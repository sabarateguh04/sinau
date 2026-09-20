import { useState } from 'react';
import { Plus, Check, X, Paperclip } from 'lucide-react';
import { post, toApiError, uploadFile, fileSrc } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, Table, Tabs, Textarea } from '@/components/ui';
import { fmtDate, fmtDateTime, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Permits() {
  const { has, hasRole, user } = useAuth();
  const canReview = has('attendance:permit_review');
  const canSubmit = has('attendance:permit_submit');
  const [status, setStatus] = useState(canReview ? 'PENDING' : '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Dict | null>(null);
  const { rows, meta, loading, reload } = useResource<Dict>('/attendance/permits', { status: status || undefined, page, limit: 20 });
  return (
    <div>
      <PageHeader title="Izin / Sakit" subtitle={canReview ? 'Verifikasi pengajuan izin siswa. Disetujui → absensi harian terisi otomatis.' : 'Ajukan izin atau sakit; wali kelas akan memverifikasi.'} actions={canSubmit && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Ajukan</Button>} />
      <Tabs className="mb-4 w-fit" value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: '', label: 'Semua' }, { value: 'PENDING', label: 'Menunggu' }, { value: 'APPROVED', label: 'Disetujui' }, { value: 'REJECTED', label: 'Ditolak' }]} />
      <Card padded={false}>
        <Table<Dict> loading={loading} rows={rows} columns={[
          { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string}</div></div> },
          { key: 'type', header: 'Jenis', render: (r) => <Badge tone={r.type === 'SAKIT' ? 'amber' : 'blue'}>{r.type as string}</Badge> },
          { key: 'date_from', header: 'Tanggal', render: (r) => `${fmtDate(r.date_from as string)} – ${fmtDate(r.date_to as string)}` },
          { key: 'reason', header: 'Alasan', render: (r) => <span className="line-clamp-2 max-w-xs text-xs">{r.reason as string}</span> },
          { key: 'attachment_url', header: '', render: (r) => r.attachment_url ? <a href={fileSrc(r.attachment_url as string)} target="_blank" rel="noreferrer" className="text-brand-700"><Paperclip className="h-4 w-4" /></a> : null },
          { key: 'status', header: 'Status', render: (r) => <div><Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge>{r.reviewer_name ? <div className="text-[10px] text-ink-3">{r.reviewer_name as string} · {fmtDateTime(r.reviewed_at as string)}</div> : null}</div> },
          { key: 'x', header: '', render: (r) => canReview && r.status === 'PENDING' ? <Button size="sm" variant="outline" onClick={() => setReview(r)}>Tinjau</Button> : null },
        ]} empty="Tidak ada pengajuan" />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
      <SubmitModal open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} children={hasRole('WALI_MURID') ? user?.children ?? [] : []} />
      <ReviewModal permit={review} onClose={() => setReview(null)} onDone={() => { setReview(null); reload(); }} />
    </div>
  );
}
function SubmitModal({ open, onClose, onDone, children }: { open: boolean; onClose: () => void; onDone: () => void; children: { id: string; full_name: string }[] }) {
  const [f, setF] = useState({ student_id: children[0]?.id ?? '', type: 'SAKIT', date_from: '', date_to: '', reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { let attachment_file_id: string | null = null; if (file) attachment_file_id = (await uploadFile('permits', file)).id; await post('/attendance/permits', { ...f, student_id: f.student_id || undefined, date_to: f.date_to || f.date_from, attachment_file_id }); toast.success('Pengajuan terkirim'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Ajukan izin / sakit" size="sm" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={submit}>Kirim</Button></>}>
      <div className="space-y-3">{children.length > 0 && <Field label="Anak"><Select value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} options={children.map((c) => ({ value: c.id, label: c.full_name }))} /></Field>}<Field label="Jenis"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[{ value: 'SAKIT', label: 'Sakit' }, { value: 'IZIN', label: 'Izin' }]} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Dari" required><Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field><Field label="Sampai"><Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field></div><Field label="Alasan" required><Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field><Field label="Surat dokter / lampiran (opsional)"><input type="file" className="text-sm" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></div>
    </Modal>
  );
}
function ReviewModal({ permit, onClose, onDone }: { permit: Dict | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (status: 'APPROVED' | 'REJECTED') => { setBusy(true); try { await post(`/attendance/permits/${permit!.id}/review`, { status, note: note || null }); toast.success(status === 'APPROVED' ? 'Disetujui' : 'Ditolak'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={!!permit} onClose={onClose} title="Tinjau pengajuan" size="sm" footer={<><Button variant="danger" loading={busy} icon={<X className="h-4 w-4" />} onClick={() => act('REJECTED')}>Tolak</Button><Button loading={busy} icon={<Check className="h-4 w-4" />} onClick={() => act('APPROVED')}>Setujui</Button></>}>
      {permit && <div className="space-y-2 text-sm"><div><b>{permit.student_name as string}</b> · {permit.type as string}</div><div>{fmtDate(permit.date_from as string)} – {fmtDate(permit.date_to as string)}</div><p className="rounded-xl bg-surface-2 p-3">{permit.reason as string}</p>{permit.attachment_url ? <a href={fileSrc(permit.attachment_url as string)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1"><Paperclip className="h-4 w-4" /> Lihat lampiran</a> : null}<Field label="Catatan (opsional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>}
    </Modal>
  );
}
