import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Phone, Mail, Globe, ArrowRight, Newspaper, Users, GraduationCap, Layers, Star, Menu, X } from 'lucide-react';
import { api } from '@/lib/api';
import { applyBrand } from '@/lib/brand';
import { Button, Loading, EmptyState, Input, Textarea, Field } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { toast } from '@/store/ui';
import { Dict } from '@/lib/types';

const PAGES = [['home', 'Beranda'], ['tentang', 'Tentang'], ['program', 'Program Keahlian'], ['fasilitas', 'Fasilitas'], ['ekskul', 'Ekstrakurikuler'], ['prestasi', 'Prestasi'], ['galeri', 'Galeri'], ['testimoni', 'Testimoni'], ['berita', 'Berita'], ['faq', 'FAQ'], ['kontak', 'Kontak']] as const;

export default function TenantSite() {
  const { slug, page = 'home', newsSlug } = useParams();
  const [t, setT] = useState<Dict | null>(null);
  const [err, setErr] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    api.get(`/public/tenants/${slug}`).then((r) => { setT(r.data.data); applyBrand(r.data.data.primary_color, r.data.data.accent_color); }).catch(() => setErr(true));
    return () => applyBrand(null, null);
  }, [slug]);
  if (err) return <div className="py-24"><EmptyState title="Lembaga tidak ditemukan" action={<Link to="/welcome"><Button>Kembali</Button></Link>} /></div>;
  if (!t) return <Loading />;
  const name = (t.display_name as string) || (t.name as string);
  const pages = (t.pages as Dict[]) ?? [];
  const home = pages.find((p) => p.slug === 'home');
  const current = newsSlug ? 'berita' : page;
  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={`/s/${slug}`} className="flex min-w-0 items-center gap-3">{t.logo_url ? <img src={t.logo_url as string} className="h-10 w-10 rounded-xl object-cover" alt="" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 font-black text-white">{name[0]}</div>}<div className="min-w-0"><div className="truncate font-bold">{name}</div><div className="truncate text-[11px] text-ink-3">{t.tagline as string}</div></div></Link>
          <nav className="hidden items-center gap-1 lg:flex">{PAGES.map(([k, l]) => <Link key={k} to={k === 'home' ? `/s/${slug}` : `/s/${slug}/${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${current === k ? 'bg-brand-100 font-semibold text-brand-800' : 'text-ink-2 hover:bg-surface-3'}`}>{l}</Link>)}</nav>
          <div className="flex items-center gap-2">{t.ppdb ? <Link to={`/ppdb/${slug}`}><Button size="sm" variant="accent">PPDB</Button></Link> : null}<Link to="/login"><Button size="sm">Masuk</Button></Link><button className="rounded-lg p-2 lg:hidden" onClick={() => setMenu(!menu)}>{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button></div>
        </div>
        {menu && <nav className="grid grid-cols-2 gap-1 border-t border-line p-3 lg:hidden">{PAGES.map(([k, l]) => <Link key={k} onClick={() => setMenu(false)} to={k === 'home' ? `/s/${slug}` : `/s/${slug}/${k}`} className="rounded-lg px-3 py-2 text-sm hover:bg-surface-3">{l}</Link>)}</nav>}
      </header>

      {current === 'home' && (
        <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">{(home?.hero_title as string) || name}</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">{(home?.hero_subtitle as string) || (t.tagline as string)}</p>
            <div className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[[Users, t.stats && (t.stats as Dict).students, 'Siswa'], [GraduationCap, t.stats && (t.stats as Dict).teachers, 'Guru'], [Layers, t.stats && (t.stats as Dict).majors, 'Jurusan'], [Star, t.stats && (t.stats as Dict).extracurriculars, 'Ekskul']].map(([I, n, l], i) => { const Icon = I as typeof Users; return <div key={i} className="rounded-2xl bg-white/10 p-4"><Icon className="h-5 w-5 text-accent-400" /><div className="mt-2 text-2xl font-extrabold">{String(n ?? 0)}</div><div className="text-xs text-white/70">{String(l)}</div></div>; })}
            </div>
          </div>
        </section>
      )}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {current === 'home' && <HomeBody t={t} slug={slug!} />}
        {current === 'tentang' && <PageBody p={pages.find((x) => x.slug === 'tentang')} fallback={`Profil ${name}`} />}
        {current === 'program' && <Cards title="Program Keahlian" items={(t.majors as Dict[]).map((m) => ({ title: `${m.code} — ${m.name}`, body: m.description as string }))} />}
        {['fasilitas', 'ekskul', 'prestasi', 'galeri', 'testimoni', 'faq'].includes(current) && <Collection slug={slug!} kind={current} />}
        {current === 'berita' && <News slug={slug!} newsSlug={newsSlug} />}
        {current === 'kontak' && <Contact t={t} slug={slug!} />}
      </div>
    </div>
  );
}
function HomeBody({ t, slug }: { t: Dict; slug: string }) {
  const [news, setNews] = useState<Dict[]>([]);
  useEffect(() => { api.get(`/public/tenants/${slug}/news`, { params: { limit: 3 } }).then((r) => setNews(r.data.data)).catch(() => undefined); }, [slug]);
  return (
    <div className="space-y-12">
      <div><h2 className="mb-4 text-2xl font-bold">Program Keahlian</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(t.majors as Dict[]).map((m) => <div key={m.code as string} className="card p-5"><div className="chip bg-brand-100 text-brand-800">{m.code as string}</div><div className="mt-2 font-semibold">{m.name as string}</div><div className="mt-1 text-sm text-ink-2">{(m.description as string) || 'Program keahlian unggulan.'}</div></div>)}</div></div>
      {news.length > 0 && <div><div className="mb-4 flex items-end justify-between"><h2 className="text-2xl font-bold">Berita terbaru</h2><Link to={`/s/${slug}/berita`} className="link text-sm">Semua berita</Link></div><div className="grid gap-4 sm:grid-cols-3">{news.map((n) => <NewsCard key={n.id as string} n={n} slug={slug} />)}</div></div>}
      {t.ppdb ? <div className="card flex flex-col items-start gap-3 bg-gradient-to-r from-amber-50 to-surface p-6 dark:from-amber-900/20 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-lg font-bold">{(t.ppdb as Dict).name as string}</div><div className="text-sm text-ink-2">Pendaftaran dibuka hingga {fmtDate((t.ppdb as Dict).close_at as string)}. Kuota {(t.ppdb as Dict).quota as number} siswa.</div></div><Link to={`/ppdb/${slug}`}><Button variant="accent" icon={<ArrowRight className="h-4 w-4" />}>Daftar sekarang</Button></Link></div> : null}
    </div>
  );
}
function PageBody({ p, fallback }: { p?: Dict; fallback: string }) {
  const sections = (p?.sections as Dict[]) ?? [];
  return <div className="max-w-3xl"><h1 className="text-3xl font-bold">{(p?.hero_title as string) || fallback}</h1>{p?.hero_subtitle ? <p className="mt-2 text-ink-2">{p.hero_subtitle as string}</p> : null}{sections.filter((s) => s.type === 'text').map((s, i) => <div key={i} className="mt-6"><h2 className="text-xl font-semibold">{s.title as string}</h2><p className="mt-2 whitespace-pre-line leading-7 text-ink-2">{s.body as string}</p></div>)}{!p && <p className="mt-4 text-ink-2">Konten halaman belum diisi.</p>}</div>;
}
function Cards({ title, items }: { title: string; items: { title: string; body?: string; sub?: string }[] }) {
  return <div><h1 className="mb-5 text-3xl font-bold">{title}</h1>{items.length === 0 ? <EmptyState title="Belum ada data" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((it, i) => <div key={i} className="card p-5"><div className="font-semibold">{it.title}</div>{it.sub && <div className="text-xs text-ink-3">{it.sub}</div>}{it.body && <div className="mt-1 text-sm text-ink-2">{it.body}</div>}</div>)}</div>}</div>;
}
function Collection({ slug, kind }: { slug: string; kind: string }) {
  const map: Record<string, [string, string]> = { fasilitas: ['facilities', 'Fasilitas'], ekskul: ['extracurriculars', 'Ekstrakurikuler'], prestasi: ['achievements', 'Prestasi'], galeri: ['gallery', 'Galeri'], testimoni: ['testimonials', 'Testimoni'], faq: ['faqs', 'Pertanyaan Umum'] };
  const [rows, setRows] = useState<Dict[] | null>(null);
  useEffect(() => { setRows(null); api.get(`/public/tenants/${slug}/${map[kind][0]}`).then((r) => setRows(r.data.data)).catch(() => setRows([])); }, [slug, kind]);
  if (!rows) return <Loading />;
  if (kind === 'galeri') return <div><h1 className="mb-5 text-3xl font-bold">Galeri</h1>{rows.length === 0 ? <EmptyState /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{rows.map((g, i) => <img key={i} src={g.photo_url as string} alt={(g.title as string) || ''} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />)}</div>}</div>;
  if (kind === 'faq') return <div className="max-w-3xl"><h1 className="mb-5 text-3xl font-bold">Pertanyaan Umum</h1>{rows.map((f, i) => <details key={i} className="card mb-2 p-4"><summary className="cursor-pointer font-semibold">{f.question as string}</summary><p className="mt-2 text-sm text-ink-2">{f.answer as string}</p></details>)}</div>;
  if (kind === 'testimoni') return <Cards title="Testimoni" items={rows.map((r) => ({ title: r.name as string, sub: r.role_label as string, body: `“${r.quote}”` }))} />;
  if (kind === 'prestasi') return <Cards title="Prestasi" items={rows.map((r) => ({ title: r.title as string, sub: `${r.level} · ${r.rank ?? ''} · ${fmtDate(r.achieved_at as string)}`, body: `${r.student_name} — ${r.organizer ?? ''}` }))} />;
  if (kind === 'ekskul') return <Cards title="Ekstrakurikuler" items={rows.map((r) => ({ title: r.name as string, sub: r.schedule_text as string, body: r.description as string }))} />;
  return <Cards title={map[kind][1]} items={rows.map((r) => ({ title: r.name as string, body: r.description as string }))} />;
}
function NewsCard({ n, slug }: { n: Dict; slug: string }) {
  return <Link to={`/s/${slug}/berita/${n.slug}`} className="card overflow-hidden transition hover:border-brand-400">{n.cover_url ? <img src={n.cover_url as string} className="h-40 w-full object-cover" alt="" /> : <div className="flex h-40 items-center justify-center bg-brand-50 text-brand-300"><Newspaper className="h-10 w-10" /></div>}<div className="p-4"><div className="text-[11px] text-ink-3">{fmtDate(n.published_at as string)} · {n.category as string}</div><div className="mt-1 font-semibold">{n.title as string}</div><div className="mt-1 line-clamp-2 text-sm text-ink-2">{n.excerpt as string}</div></div></Link>;
}
function News({ slug, newsSlug }: { slug: string; newsSlug?: string }) {
  const [rows, setRows] = useState<Dict[]>([]);
  const [one, setOne] = useState<Dict | null>(null);
  useEffect(() => { if (newsSlug) api.get(`/public/tenants/${slug}/news/${newsSlug}`).then((r) => setOne(r.data.data)); else api.get(`/public/tenants/${slug}/news`, { params: { limit: 30 } }).then((r) => setRows(r.data.data)); }, [slug, newsSlug]);
  if (newsSlug) return one ? <article className="mx-auto max-w-3xl"><div className="text-xs text-ink-3">{fmtDate(one.published_at as string)} · {one.category as string} · {one.author as string}</div><h1 className="mt-2 text-3xl font-bold">{one.title as string}</h1>{one.cover_url ? <img src={one.cover_url as string} className="mt-5 w-full rounded-2xl" alt="" /> : null}<div className="prose-sinau mt-5 whitespace-pre-line">{one.body as string}</div><Link to={`/s/${slug}/berita`} className="link mt-8 inline-block text-sm">← Semua berita</Link></article> : <Loading />;
  return <div><h1 className="mb-5 text-3xl font-bold">Berita</h1>{rows.length === 0 ? <EmptyState title="Belum ada berita" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((n) => <NewsCard key={n.id as string} n={n} slug={slug} />)}</div>}</div>;
}
function Contact({ t, slug }: { t: Dict; slug: string }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await api.post(`/public/tenants/${slug}/contact`, { ...f, email: f.email || undefined, phone: f.phone || undefined, subject: f.subject || undefined }); toast.success('Pesan terkirim'); setF({ name: '', email: '', phone: '', subject: '', message: '' }); } catch { toast.error('Gagal mengirim'); } finally { setBusy(false); } };
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div><h1 className="text-3xl font-bold">Hubungi Kami</h1><div className="mt-5 space-y-3 text-sm text-ink-2">{t.address ? <div className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-brand-700" />{t.address as string}{t.kota_nama ? `, ${t.kota_nama}` : ''}{t.provinsi_nama ? `, ${t.provinsi_nama}` : ''}</div> : null}{t.phone ? <div className="flex gap-3"><Phone className="h-5 w-5 text-brand-700" />{t.phone as string}</div> : null}{t.email ? <div className="flex gap-3"><Mail className="h-5 w-5 text-brand-700" />{t.email as string}</div> : null}{t.website ? <div className="flex gap-3"><Globe className="h-5 w-5 text-brand-700" />{t.website as string}</div> : null}</div></div>
      <form onSubmit={send} className="card space-y-3 p-5"><Field label="Nama" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field><div className="grid grid-cols-2 gap-3"><Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Telepon"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div><Field label="Subjek"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field><Field label="Pesan" required><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required /></Field><Button type="submit" loading={busy}>Kirim</Button></form>
    </div>
  );
}
