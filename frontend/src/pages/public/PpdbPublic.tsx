import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Upload, ArrowLeft, Copy } from 'lucide-react';
import { api, toApiError } from '@/lib/api';
import { applyBrand } from '@/lib/brand';
import { Button, Card, Field, Input, Select, Textarea, Loading, Badge, EmptyState } from '@/components/ui';
import { fmtDate, fmtDateTime, label, tone } from '@/lib/format';
import { toast } from '@/store/ui';
import { Dict } from '@/lib/types';

export default function PpdbPublic() {
  const { slug, view = 'info' } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [d, setD] = useState<{ tenant: Dict; periods: Dict[]; majors: Dict[] } | null>(null);
  useEffect(() => { api.get(`/public/tenants/${slug}/ppdb`).then((r) => { setD(r.data.data); applyBrand(r.data.data.tenant.primary_color, null); }).catch(() => nav('/welcome')); return () => applyBrand(null, null); }, [slug, nav]);
  if (!d) return <Loading />;
  const open = d.periods.filter((p) => p.is_open);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link to={`/s/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" /> {(d.tenant.display_name as string) || (d.tenant.name as string)}</Link>
      <h1 className="text-3xl font-bold">PPDB {(d.tenant.display_name as string) || (d.tenant.name as string)}</h1>
      <div className="mt-4 flex gap-2">{[['info', 'Informasi'], ['daftar', 'Daftar'], ['status', 'Cek status']].map(([k, l]) => <Link key={k} to={`/ppdb/${slug}/${k}`} className={`rounded-xl px-4 py-2 text-sm font-medium ${view === k ? 'bg-brand-700 text-white' : 'bg-surface-3 text-ink-2'}`}>{l}</Link>)}</div>
      <div className="mt-6">
        {view === 'info' && (d.periods.length === 0 ? <EmptyState title="Belum ada periode PPDB" /> : d.periods.map((p) => (
          <Card key={p.id as string} className="mb-4" title={p.name as string} action={<Badge tone={p.is_open ? 'green' : 'gray'}>{p.is_open ? 'Dibuka' : 'Ditutup'}</Badge>}>
            <div className="text-sm text-ink-2">{fmtDate(p.open_at as string)} – {fmtDate(p.close_at as string)} · Kuota {p.quota as number} · Pendaftar {p.applicant_count as number}</div>
            {p.announcement ? <p className="mt-2 text-sm">{p.announcement as string}</p> : null}
            {Array.isArray(p.requirements) && <div className="mt-3"><div className="text-xs font-semibold uppercase text-ink-3">Persyaratan dokumen</div><ul className="mt-1 list-disc pl-5 text-sm">{(p.requirements as string[]).map((r) => <li key={r}>{r}</li>)}</ul></div>}
            {Array.isArray(p.paths) && <div className="mt-3 flex flex-wrap gap-1">{(p.paths as string[]).map((x) => <Badge key={x} tone="blue">{x}</Badge>)}</div>}
            {p.is_open ? <Link to={`/ppdb/${slug}/daftar`}><Button className="mt-4">Daftar di periode ini</Button></Link> : null}
          </Card>
        )))}
        {view === 'daftar' && (open.length === 0 ? <EmptyState title="Pendaftaran belum dibuka" /> : <ApplyForm slug={slug!} periods={open} majors={d.majors} onDone={(r) => nav(`/ppdb/${slug}/status?token=${r.access_token}&no=${r.registration_no}`)} />)}
        {view === 'status' && <StatusView slug={slug!} initialToken={sp.get('token') ?? ''} regNo={sp.get('no') ?? ''} />}
      </div>
    </div>
  );
}

function ApplyForm({ slug, periods, majors, onDone }: { slug: string; periods: Dict[]; majors: Dict[]; onDone: (r: { access_token: string; registration_no: string }) => void }) {
  const [f, setF] = useState<Dict>({ period_id: periods[0].id, full_name: '', nisn: '', nik: '', gender: '', birth_place: '', birth_date: '', origin_school: '', address: '', phone: '', email: '', parent_name: '', parent_phone: '', major_choice_1: '', major_choice_2: '', path: '' });
  const [busy, setBusy] = useState(false);
  const period = periods.find((p) => p.id === f.period_id);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const body: Dict = {}; for (const [k, v] of Object.entries(f)) body[k] = v === '' ? null : v; const r = await api.post(`/public/tenants/${slug}/ppdb/apply`, body); toast.success('Pendaftaran terkirim'); onDone(r.data.data); } catch (err) { toast.error('Gagal mendaftar', toApiError(err).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card grid gap-4 p-6 sm:grid-cols-2">
      <Field label="Periode" required className="sm:col-span-2"><Select value={String(f.period_id)} onChange={(e) => set('period_id', e.target.value)} options={periods.map((p) => ({ value: p.id as string, label: p.name as string }))} /></Field>
      <Field label="Nama lengkap" required className="sm:col-span-2"><Input value={String(f.full_name)} onChange={(e) => set('full_name', e.target.value)} required /></Field>
      <Field label="NISN"><Input value={String(f.nisn)} onChange={(e) => set('nisn', e.target.value)} /></Field>
      <Field label="NIK"><Input value={String(f.nik)} onChange={(e) => set('nik', e.target.value)} /></Field>
      <Field label="Jenis kelamin"><Select value={String(f.gender)} onChange={(e) => set('gender', e.target.value)} placeholder="— pilih —" options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} /></Field>
      <Field label="Tanggal lahir"><Input type="date" value={String(f.birth_date)} onChange={(e) => set('birth_date', e.target.value)} /></Field>
      <Field label="Tempat lahir"><Input value={String(f.birth_place)} onChange={(e) => set('birth_place', e.target.value)} /></Field>
      <Field label="Asal sekolah"><Input value={String(f.origin_school)} onChange={(e) => set('origin_school', e.target.value)} /></Field>
      <Field label="Alamat" className="sm:col-span-2"><Textarea rows={2} value={String(f.address)} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="No. HP" required><Input value={String(f.phone)} onChange={(e) => set('phone', e.target.value)} required /></Field>
      <Field label="E-mail" hint="Kode akses akan dikirim ke sini"><Input type="email" value={String(f.email)} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Nama orang tua/wali"><Input value={String(f.parent_name)} onChange={(e) => set('parent_name', e.target.value)} /></Field>
      <Field label="No. HP orang tua/wali"><Input value={String(f.parent_phone)} onChange={(e) => set('parent_phone', e.target.value)} /></Field>
      <Field label="Pilihan jurusan 1"><Select value={String(f.major_choice_1)} onChange={(e) => set('major_choice_1', e.target.value)} placeholder="— pilih —" options={majors.map((m) => ({ value: m.id as string, label: `${m.code} — ${m.name}` }))} /></Field>
      <Field label="Pilihan jurusan 2"><Select value={String(f.major_choice_2)} onChange={(e) => set('major_choice_2', e.target.value)} placeholder="— pilih —" options={majors.map((m) => ({ value: m.id as string, label: `${m.code} — ${m.name}` }))} /></Field>
      {Array.isArray(period?.paths) && <Field label="Jalur pendaftaran"><Select value={String(f.path)} onChange={(e) => set('path', e.target.value)} placeholder="— pilih —" options={(period!.paths as string[]).map((p) => ({ value: p, label: p }))} /></Field>}
      <div className="sm:col-span-2"><Button type="submit" size="lg" loading={busy}>Kirim pendaftaran</Button></div>
    </form>
  );
}

function StatusView({ slug, initialToken, regNo }: { slug: string; initialToken: string; regNo: string }) {
  const [token, setToken] = useState(initialToken);
  const [data, setData] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (t = token) => { if (!t) return; setBusy(true); try { const r = await api.get(`/public/tenants/${slug}/ppdb/status`, { params: { token: t } }); setData(r.data.data); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  useEffect(() => { if (initialToken) load(initialToken); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialToken]);
  const upload = async (docType: string, file: File) => { const fd = new FormData(); fd.append('file', file); fd.append('doc_type', docType); fd.append('token', token); try { await api.post(`/public/tenants/${slug}/ppdb/documents`, fd); toast.success('Dokumen terunggah'); load(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <div className="space-y-4">
      {regNo && <div className="card flex items-start gap-3 border-emerald-300 bg-emerald-50 p-4 text-sm dark:bg-emerald-900/20"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><div className="font-semibold">Pendaftaran berhasil. Nomor: {regNo}</div><div className="mt-1 flex items-center gap-2">Kode akses: <code className="rounded bg-surface px-2 py-0.5 font-mono">{token}</code><button onClick={() => { navigator.clipboard?.writeText(token); toast.success('Disalin'); }}><Copy className="h-4 w-4" /></button></div><div className="text-xs text-ink-2">Simpan kode ini untuk memantau status & mengunggah dokumen.</div></div></div>}
      <Card><div className="flex gap-2"><Input placeholder="Kode akses" value={token} onChange={(e) => setToken(e.target.value)} /><Button loading={busy} onClick={() => load()}>Cek</Button></div></Card>
      {data && (
        <Card title={`No. ${data.registration_no}`} action={<Badge tone={tone(data.status as string)}>{label(data.status as string)}</Badge>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2"><dt className="text-ink-3">Nama</dt><dd>{data.full_name as string}</dd><dt className="text-ink-3">Periode</dt><dd>{data.period_name as string}</dd><dt className="text-ink-3">Pilihan 1</dt><dd>{(data.major1_name as string) ?? '-'}</dd><dt className="text-ink-3">Pilihan 2</dt><dd>{(data.major2_name as string) ?? '-'}</dd><dt className="text-ink-3">Didaftarkan</dt><dd>{fmtDateTime(data.created_at as string)}</dd>{data.verification_note ? <><dt className="text-ink-3">Catatan</dt><dd>{data.verification_note as string}</dd></> : null}</dl>
          <div className="mt-5"><div className="text-xs font-semibold uppercase text-ink-3">Dokumen</div>
            <div className="mt-2 space-y-2">{((data.requirements as string[]) ?? ['Dokumen']).map((req) => { const doc = (data.documents as Dict[]).find((x) => x.doc_type === req); return (
              <div key={req} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm"><div><div className="font-medium">{req}</div>{doc ? <div className="text-xs text-ink-3">{doc.original_name as string} · <Badge tone={tone(doc.status as string)}>{label(doc.status as string)}</Badge></div> : <div className="text-xs text-ink-3">Belum diunggah</div>}</div><label className="cursor-pointer"><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => e.target.files?.[0] && upload(req, e.target.files[0])} /><span className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-3"><Upload className="h-3.5 w-3.5" /> {doc ? 'Ganti' : 'Unggah'}</span></label></div>
            ); })}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
