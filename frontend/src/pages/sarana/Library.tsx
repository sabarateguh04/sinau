import { useEffect, useState } from 'react';
import { BookMarked, Check, X, Undo2, Library as LibIcon } from 'lucide-react';
import { get, post, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, StatCard, Tabs } from '@/components/ui';
import { fmtDate, fmtMoney, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Library() {
  const { has, hasRole } = useAuth();
  const canWrite = has('library:write');
  const [tab, setTab] = useState<'katalog' | 'pinjam'>('katalog');
  const [s, setS] = useState<Dict | null>(null);
  const [loanFor, setLoanFor] = useState<Dict | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { get<Dict>('/sarana/library-summary').then(setS); }, [key]);
  return (
    <div>
      <PageHeader title="Perpustakaan" subtitle={canWrite ? 'Katalog, peminjaman, pengembalian, dan denda keterlambatan (Rp1.000/hari).' : 'Cari buku dan ajukan peminjaman; ambil di perpustakaan setelah disetujui.'} />
      {s && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Judul" value={String(s.titles)} icon={<LibIcon className="h-5 w-5" />} /><StatCard label="Eksemplar" value={String(s.copies)} tone="blue" /><StatCard label="Dipinjam" value={String(s.on_loan)} tone="accent" /><StatCard label="Terlambat" value={String(s.overdue)} tone="red" /><StatCard label="Permintaan" value={String(s.requested)} tone="purple" /></div>}
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'katalog', label: 'Katalog' }, { value: 'pinjam', label: canWrite ? 'Peminjaman' : 'Pinjaman saya' }]} />
      {tab === 'katalog' && <CrudPage<Dict> key={key} noHeader title="Katalog" endpoint="/sarana/books" entityLabel="buku" modalSize="lg" perm={{ write: 'library:write' }} searchPlaceholder="Judul / penulis / ISBN"
        columns={[{ key: 'title', header: 'Buku', render: (r) => <div className="flex items-center gap-3">{r.cover_url ? <img src={r.cover_url as string} className="h-12 w-9 rounded object-cover" alt="" /> : <div className="flex h-12 w-9 items-center justify-center rounded bg-surface-3"><BookMarked className="h-4 w-4 text-ink-3" /></div>}<div><div className="font-medium">{r.title as string}</div><div className="text-xs text-ink-3">{r.author as string}{r.publisher ? ` · ${r.publisher}` : ''}{r.year ? ` (${r.year})` : ''}</div></div></div> }, { key: 'code', header: 'Kode / ISBN', render: (r) => <span className="text-xs">{r.code as string}<br /><span className="text-ink-3">{r.isbn as string}</span></span> }, { key: 'category', header: 'Kategori' }, { key: 'shelf', header: 'Rak' }, { key: 'available', header: 'Tersedia', render: (r) => <Badge tone={Number(r.available) > 0 ? 'green' : 'red'}>{r.available as number}/{r.stock as number}</Badge> }]}
        rowActions={(r) => Number(r.available) > 0 && (has('library:loan') || canWrite) ? <Button size="sm" variant="outline" onClick={() => setLoanFor(r)}>{canWrite ? 'Pinjamkan' : 'Ajukan pinjam'}</Button> : null}
        fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'isbn', label: 'ISBN' }, { name: 'title', label: 'Judul', required: true, span: 2 }, { name: 'author', label: 'Penulis' }, { name: 'publisher', label: 'Penerbit' }, { name: 'year', label: 'Tahun', type: 'number' }, { name: 'category', label: 'Kategori' }, { name: 'stock', label: 'Stok', type: 'number', defaultValue: 1 }, { name: 'shelf', label: 'Rak' }]} />}
      {tab === 'pinjam' && <CrudPage<Dict> key={key} noHeader title="Peminjaman" endpoint="/sarana/loans" entityLabel="pinjaman" perm={{ write: 'library:write' }} canCreate={false} canEdit={false} canDelete={false}
        columns={[{ key: 'book_title', header: 'Buku', render: (r) => <span>{r.book_title as string} <span className="text-xs text-ink-3">{r.book_code as string}</span></span> }, ...(canWrite ? [{ key: 'borrower_name', header: 'Peminjam' }] : []), { key: 'borrowed_at', header: 'Pinjam', render: (r) => fmtDate(r.borrowed_at as string) }, { key: 'due_at', header: 'Jatuh tempo', render: (r) => <span className={r.status === 'BORROWED' && new Date(r.due_at as string) < new Date() ? 'font-semibold text-red-600' : ''}>{fmtDate(r.due_at as string)}</span> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'REQUESTED' ? 'amber' : tone(r.status as string)}>{r.status === 'REQUESTED' ? 'Diajukan' : label(r.status as string)}</Badge> }, { key: 'fine', header: 'Denda', render: (r) => Number(r.fine) ? fmtMoney(r.fine as number) : '-' }]}
        filters={[{ name: 'status', label: 'Status', options: ['REQUESTED', 'BORROWED', 'RETURNED', 'LATE', 'CANCELLED'].map((x) => ({ value: x, label: x === 'REQUESTED' ? 'Diajukan' : label(x) })) }]}
        rowActions={(r, reload) => canWrite ? <div className="flex gap-1">{r.status === 'REQUESTED' && <><Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={async () => { await post(`/sarana/loans/${r.id}/reject`); reload(); setKey((k) => k + 1); }} /><Button size="sm" icon={<Check className="h-4 w-4" />} onClick={async () => { await post(`/sarana/loans/${r.id}/approve`); reload(); setKey((k) => k + 1); }}>Serahkan</Button></>}{r.status === 'BORROWED' && <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={async () => { const x = await post<Dict>(`/sarana/loans/${r.id}/return`); toast.success(x.fine ? `Dikembalikan terlambat ${x.late_days} hari, denda ${fmtMoney(x.fine as number)}` : 'Dikembalikan'); reload(); setKey((k) => k + 1); }}>Kembalikan</Button>}</div> : null} />}
      <LoanModal book={loanFor} self={!canWrite} onClose={() => setLoanFor(null)} onDone={() => { setLoanFor(null); setKey((k) => k + 1); setTab('pinjam'); }} />
      <span className="hidden">{hasRole('SISWA') ? 's' : ''}</span>
    </div>
  );
}
function LoanModal({ book, self, onClose, onDone }: { book: Dict | null; self: boolean; onClose: () => void; onDone: () => void }) {
  const [borrowers, setBorrowers] = useState<Dict[]>([]);
  const [f, setF] = useState({ borrower_id: '', days: '7' });
  useEffect(() => { if (book && !self) get<unknown>('/users', { limit: 500 }).then((d) => setBorrowers((d as { data?: Dict[] }).data ?? [])); }, [book, self]);
  const submit = async () => { try { const r = await post<Dict>('/sarana/loans', { book_id: book!.id, borrower_id: self ? undefined : f.borrower_id || undefined, days: Number(f.days) }); toast.success(r.status === 'REQUESTED' ? 'Permintaan dikirim ke pustakawan' : 'Peminjaman dicatat'); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  return <Modal open={!!book} onClose={onClose} size="sm" title={`Pinjam: ${book?.title ?? ''}`} footer={<Button onClick={submit}>{self ? 'Ajukan' : 'Catat peminjaman'}</Button>}><div className="space-y-3">{!self && <Field label="Peminjam"><Select value={f.borrower_id} onChange={(e) => setF({ ...f, borrower_id: e.target.value })} placeholder="— saya sendiri —" options={borrowers.map((b) => ({ value: b.id as string, label: `${b.full_name}${b.class_name ? ` — ${b.class_name}` : ''}` }))} /></Field>}<Field label="Lama pinjam (hari)"><Input type="number" min={1} max={60} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field></div></Modal>;
}
