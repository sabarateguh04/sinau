import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, GraduationCap, School, BookOpen, ClipboardList, CalendarCheck, Wallet, Megaphone, Clock, ListChecks, PenTool, Building2, ArrowRight, Sparkles, Bell } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';
import { get } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { StatCard, Card, Loading, Badge, EmptyState, Progress, Avatar } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtTime, fmtMoney, fmtAgo, label, tone, fmtScore } from '@/lib/format';
import { Dict, ROLE_LABELS } from '@/lib/types';

export default function Dashboard() {
  const { user, activeRole } = useAuth();
  const [d, setD] = useState<Dict | null>(null);
  const p = rolePrefix(activeRole);
  useEffect(() => { setD(null); get<Dict>('/dashboard', { role: activeRole }).then(setD).catch(() => setD({})); }, [activeRole]);
  if (!user) return null;
  if (!d) return <Loading />;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const stats = d.stats as Dict | undefined;
  const isSuper = activeRole === 'SUPER_ADMIN';
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold">{greet}, {user.full_name.split(' ')[0]} 👋</h1><p className="text-sm text-ink-2">{ROLE_LABELS[activeRole!]} · {user.tenant?.display_name || user.tenant?.name || 'Platform SINAU'} · {fmtDate(new Date(), 'EEEE, d MMMM yyyy')}</p></div>
        {user.onboarding && !user.onboarding.completed_at && <Link to={`/${p}/profil`} className="text-sm text-brand-700 hover:underline">Lengkapi profil Anda →</Link>}
      </div>

      {isSuper && <SuperAdminHome />}

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Siswa aktif" value={String(stats.students)} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Guru" value={String(stats.teachers)} icon={<GraduationCap className="h-5 w-5" />} tone="blue" />
          <StatCard label="Kelas aktif" value={String(stats.classes)} icon={<School className="h-5 w-5" />} tone="purple" />
          <StatCard label="Aktif 7 hari" value={String(stats.active_7d)} hint="pengguna login" icon={<Clock className="h-5 w-5" />} tone="green" />
          <StatCard label="Materi terbit" value={String(stats.materials)} icon={<BookOpen className="h-5 w-5" />} tone="accent" />
          <StatCard label="Tugas aktif" value={String(stats.assignments)} icon={<ClipboardList className="h-5 w-5" />} tone="blue" />
          <StatCard label="Izin menunggu" value={String(stats.pending_permits)} icon={<CalendarCheck className="h-5 w-5" />} tone="red" />
          <StatCard label="Tunggakan" value={fmtMoney(stats.outstanding_invoices as number)} icon={<Wallet className="h-5 w-5" />} tone="red" />
        </div>
      )}
      {stats && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Kehadiran 14 hari terakhir" className="lg:col-span-2">
            {(d.attendance_trend as Dict[]).length === 0 ? <EmptyState title="Belum ada data absensi" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={(d.attendance_trend as Dict[]).map((x) => ({ ...x, date: fmtDate(x.date as string, 'd/M') }))}>
                  <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} />
                  <Area type="monotone" dataKey="present_rate" name="Hadir %" stroke="var(--brand-600)" fill="url(#g1)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card title="Rata-rata nilai per mapel">
            {(d.grade_by_subject as Dict[]).length === 0 ? <EmptyState title="Belum ada nilai" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.grade_by_subject as Dict[]} layout="vertical" margin={{ left: 8 }}><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} /><Bar dataKey="avg" name="Rata-rata" fill="var(--brand-600)" radius={[0, 6, 6, 0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
      {d.approvals ? <Card title="Menunggu persetujuan Anda"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(d.approvals as Dict).map(([k, v]) => <div key={k} className="rounded-xl bg-surface-2 p-3"><div className="text-2xl font-bold">{String(v)}</div><div className="text-xs capitalize text-ink-2">{k.replace('_', ' ')}</div></div>)}</div></Card> : null}
      {d.finance ? <div className="grid grid-cols-3 gap-3"><StatCard label="Pemasukan bulan ini" value={fmtMoney((d.finance as Dict).income_month as number)} tone="green" icon={<Wallet className="h-5 w-5" />} /><StatCard label="Tagihan terlambat" value={String((d.finance as Dict).overdue)} tone="red" /><StatCard label="Refund menunggu" value={String((d.finance as Dict).pending_refunds)} tone="accent" /></div> : null}

      {/* Teacher */}
      {d.teaching ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Jadwal hari ini" className="lg:col-span-1">
            {(d.today_schedule as Dict[]).length === 0 ? <EmptyState title="Tidak ada jadwal hari ini" /> : <ul className="space-y-2">{(d.today_schedule as Dict[]).map((s, i) => <li key={i} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3"><div className="w-14 text-xs font-semibold text-brand-700">{fmtTime(s.start_time as string)}<br />{fmtTime(s.end_time as string)}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{s.subject_name as string}</div><div className="text-xs text-ink-2">{s.class_name as string}{s.room_name ? ` · ${s.room_name}` : ''}</div></div></li>)}</ul>}
          </Card>
          <Card title="Kelas yang diampu" action={<Link to={`/${p}/kelas`} className="text-xs text-brand-700">Semua</Link>}>
            {(d.teaching as Dict[]).length === 0 ? <EmptyState title="Belum ada penugasan kelas" /> : <ul className="space-y-1">{(d.teaching as Dict[]).slice(0, 6).map((t) => <li key={t.class_subject_id as string}><Link to={`/${p}/kelas?cs=${t.class_subject_id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-3"><span><b>{t.class_name as string}</b> · {t.subject_name as string}</span><span className="text-xs text-ink-3">{t.student_count as number} siswa</span></Link></li>)}</ul>}
          </Card>
          <Card title="Perlu dinilai" action={<Link to={`/${p}/tugas`} className="text-xs text-brand-700">Semua tugas</Link>}>
            {(d.to_grade as Dict[]).length === 0 ? <EmptyState title="Semua sudah dinilai 🎉" /> : <ul className="space-y-1">{(d.to_grade as Dict[]).map((t) => <li key={t.id as string}><Link to={`/${p}/tugas/${t.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-3"><span className="min-w-0 truncate">{t.title as string}<span className="block text-xs text-ink-3">{t.class_name as string} · {t.subject_name as string}</span></span><Badge tone="amber">{t.waiting as number}</Badge></Link></li>)}</ul>}
          </Card>
          {(d.homeroom as Dict[]).length > 0 && <Card title="Wali kelas" className="lg:col-span-3"><div className="flex flex-wrap gap-3">{(d.homeroom as Dict[]).map((h) => <Link key={h.id as string} to={`/${p}/absensi?class_id=${h.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand-400"><School className="h-5 w-5 text-brand-700" /><div><div className="font-semibold">{h.name as string}</div><div className="text-xs text-ink-2">{h.student_count as number} siswa · absensi hari ini {h.attendance_today as number ? '✓' : 'belum diisi'}</div></div></Link>)}{Number(d.pending_permits) > 0 && <Link to={`/${p}/absensi/izin`} className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-900/20"><Bell className="h-4 w-4 text-amber-600" />{String(d.pending_permits)} pengajuan izin menunggu</Link>}</div></Card>}
        </div>
      ) : null}

      {/* Student */}
      {d.my_class !== undefined && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Kelas saya">{d.my_class ? <div><div className="text-2xl font-bold">{(d.my_class as Dict).name as string}</div><div className="text-sm text-ink-2">{(d.my_class as Dict).major_name as string}</div><div className="mt-2 text-xs text-ink-3">Wali kelas: {(d.my_class as Dict).homeroom_name as string}</div><div className="mt-4 text-xs font-semibold uppercase text-ink-3">Kehadiran bulan ini</div><AttendanceMini a={d.attendance_month as Dict} /></div> : <EmptyState title="Belum masuk kelas" description="Hubungi admin sekolah." />}</Card>
          <Card title="Tugas mendatang" action={<Link to={`/${p}/tugas`} className="text-xs text-brand-700">Semua</Link>}>{(d.upcoming_assignments as Dict[]).length === 0 ? <EmptyState title="Tidak ada tugas menunggu" /> : <ul className="space-y-1">{(d.upcoming_assignments as Dict[]).map((a) => <li key={a.id as string}><Link to={`/${p}/tugas/${a.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-3"><span className="min-w-0"><span className="block truncate font-medium">{a.title as string}</span><span className="text-xs text-ink-3">{a.subject_name as string}</span></span><span className="text-xs text-ink-2">{a.due_at ? fmtDate(a.due_at as string, 'd MMM HH:mm') : '-'}</span></Link></li>)}</ul>}</Card>
          <Card title="Kuis & ujian" action={<Link to={`/${p}/kuis`} className="text-xs text-brand-700">Semua</Link>}>
            {(d.open_quizzes as Dict[]).length + (d.upcoming_exams as Dict[]).length === 0 ? <EmptyState title="Tidak ada kuis terbuka" /> : <ul className="space-y-1">
              {(d.open_quizzes as Dict[]).map((q) => <li key={q.id as string}><Link to={`/${p}/kuis/${q.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-3"><span className="flex items-center gap-2 min-w-0"><ListChecks className="h-4 w-4 shrink-0 text-brand-700" /><span className="truncate">{q.title as string}</span></span><span className="text-xs text-ink-3">{q.my_attempts as number}/{q.max_attempts as number}</span></Link></li>)}
              {(d.upcoming_exams as Dict[]).map((e) => <li key={e.id as string}><Link to={`/${p}/ujian`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-3"><span className="flex items-center gap-2 min-w-0"><PenTool className="h-4 w-4 shrink-0 text-amber-600" /><span className="truncate">{e.title as string}</span></span><span className="text-xs text-ink-3">{fmtDate(e.start_at as string, 'd MMM HH:mm')}</span></Link></li>)}
            </ul>}
          </Card>
          <Card title="Materi terbaru" className="lg:col-span-2" action={<Link to={`/${p}/materi`} className="text-xs text-brand-700">Semua</Link>}>{(d.recent_materials as Dict[]).length === 0 ? <EmptyState title="Belum ada materi" /> : <ul className="grid gap-2 sm:grid-cols-2">{(d.recent_materials as Dict[]).map((m) => <li key={m.id as string}><Link to={`/${p}/materi/${m.id}`} className="block rounded-xl border border-line p-3 hover:border-brand-400"><div className="text-xs text-ink-3">{m.subject_name as string} · {fmtAgo(m.created_at as string)}</div><div className="truncate text-sm font-medium">{m.title as string}</div>{typeof m.my_progress === 'number' && <Progress value={m.my_progress as number} className="mt-2" />}</Link></li>)}</ul>}</Card>
          <Card title="Nilai terbaru" action={<Link to={`/${p}/nilai`} className="text-xs text-brand-700">Rekap</Link>}>{(d.recent_grades as Dict[]).length === 0 ? <EmptyState title="Belum ada nilai" /> : <ul className="space-y-1">{(d.recent_grades as Dict[]).map((g, i) => <li key={i} className="flex items-center justify-between px-2 py-1.5 text-sm"><span className="min-w-0"><span className="block truncate">{g.title as string}</span><span className="text-xs text-ink-3">{g.subject_name as string} · {g.component_code as string}</span></span><b className="text-brand-700">{fmtScore(g.score as number)}</b></li>)}</ul>}</Card>
          {(d.today_schedule as Dict[])?.length > 0 && <Card title="Jadwal hari ini" className="lg:col-span-3"><div className="flex flex-wrap gap-2">{(d.today_schedule as Dict[]).map((s, i) => <div key={i} className="rounded-xl bg-surface-2 px-3 py-2 text-sm"><span className="font-semibold text-brand-700">{fmtTime(s.start_time as string)}</span> {s.subject_name as string} <span className="text-xs text-ink-3">· {s.teacher_name as string}</span></div>)}</div></Card>}
        </div>
      )}

      {/* Guardian */}
      {d.children ? <div className="grid gap-4 sm:grid-cols-2">{(d.children as Dict[]).length === 0 ? <EmptyState title="Belum ada anak yang ditautkan" description="Minta admin sekolah menautkan akun Anda dengan data siswa." /> : (d.children as Dict[]).map((c) => <Card key={c.id as string}><div className="flex items-center gap-3"><Avatar name={c.full_name as string} src={c.avatar_url as string} size="lg" /><div><div className="font-semibold">{c.full_name as string}</div><div className="text-xs text-ink-2">{(c.class_name as string) ?? '-'}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><Mini l="Rata-rata nilai" v={fmtScore(c.avg_score as number)} /><Mini l="Alpa bulan ini" v={String(c.absent_month)} /><Mini l="Tugas belum" v={String(c.pending_assignments)} /><Mini l="Tunggakan" v={fmtMoney(c.outstanding as number)} /></div><div className="mt-3 flex gap-2 text-xs"><Link className="link" to={`/${p}/nilai?student=${c.id}`}>Nilai</Link><Link className="link" to={`/${p}/absensi?student=${c.id}`}>Absensi</Link><Link className="link" to={`/${p}/tugas?student=${c.id}`}>Tugas</Link></div></Card>)}</div> : null}

      {/* Mentor / examiner / applicant */}
      {d.mentees ? <Card title="Siswa bimbingan">{(d.mentees as Dict[]).length === 0 ? <EmptyState /> : <ul className="divide-y divide-line">{(d.mentees as Dict[]).map((m) => <li key={m.id as string} className="flex items-center justify-between py-2 text-sm"><span>{m.full_name as string} <span className="text-xs text-ink-3">{fmtDate(m.start_date as string)} – {fmtDate(m.end_date as string)}</span></span><span className="flex items-center gap-2"><Badge tone={tone(m.status as string)}>{label(m.status as string)}</Badge>{Number(m.pending_journals) > 0 && <Badge tone="amber">{m.pending_journals as number} jurnal</Badge>}</span></li>)}</ul>}</Card> : null}
      {d.tests ? <Card title="Jadwal uji kompetensi">{(d.tests as Dict[]).length === 0 ? <EmptyState /> : <ul className="divide-y divide-line">{(d.tests as Dict[]).map((t) => <li key={t.id as string} className="flex items-center justify-between py-2 text-sm"><span>{t.title as string} <span className="text-xs text-ink-3">{t.scheme_name as string} · {fmtDate(t.test_date as string)}</span></span><Badge tone={tone(t.status as string)}>{label(t.status as string)}</Badge></li>)}</ul>}</Card> : null}
      {d.application !== undefined && <Card title="Pendaftaran PPDB">{d.application ? <div className="text-sm">No. <b>{(d.application as Dict).registration_no as string}</b> · <Badge tone={tone((d.application as Dict).status as string)}>{label((d.application as Dict).status as string)}</Badge></div> : <EmptyState title="Belum ada pendaftaran" />}</Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pengumuman" action={<Link to={`/${p}/pengumuman`} className="text-xs text-brand-700">Semua</Link>}>
          {(d.announcements as Dict[] | undefined)?.length ? <ul className="divide-y divide-line">{(d.announcements as Dict[]).map((a) => <li key={a.id as string} className="py-2"><Link to={`/${p}/pengumuman/${a.id}`} className="flex items-start gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /><div className="min-w-0"><div className="truncate text-sm font-medium">{a.title as string}{a.is_pinned ? <Badge tone="amber" className="ml-2">Disematkan</Badge> : null}</div><div className="line-clamp-1 text-xs text-ink-2">{a.body as string}</div><div className="text-[11px] text-ink-3">{fmtAgo(a.created_at as string)}</div></div></Link></li>)}</ul> : <EmptyState title="Belum ada pengumuman" />}
        </Card>
        <Card title="Agenda mendatang">
          {(d.calendar as Dict[] | undefined)?.length ? <ul className="space-y-2">{(d.calendar as Dict[]).map((c) => <li key={c.id as string} className="flex items-center gap-3 text-sm"><div className="w-16 shrink-0 rounded-lg bg-brand-50 py-1 text-center text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{fmtDate(c.start_date as string, 'd MMM')}</div><div className="min-w-0"><div className="truncate font-medium">{c.title as string}</div><div className="text-xs text-ink-3">{c.type as string}{c.end_date !== c.start_date ? ` · s.d. ${fmtDate(c.end_date as string, 'd MMM')}` : ''}</div></div></li>)}</ul> : <EmptyState title="Belum ada agenda" />}
        </Card>
      </div>
      {d.recent_audit ? <Card title="Aktivitas terbaru"><ul className="divide-y divide-line text-sm">{(d.recent_audit as Dict[]).map((a, i) => <li key={i} className="flex items-center justify-between py-1.5"><span><b>{(a.full_name as string) ?? 'Sistem'}</b> · {a.action as string}</span><span className="text-xs text-ink-3">{fmtDateTime(a.created_at as string)}</span></li>)}</ul></Card> : null}
    </div>
  );
}
const Mini = ({ l, v }: { l: string; v: string }) => <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-ink-3">{l}</div><div className="font-semibold">{v}</div></div>;
function AttendanceMini({ a }: { a?: Dict }) {
  if (!a || !Number(a.total)) return <div className="text-sm text-ink-3">Belum ada data</div>;
  const total = Number(a.total);
  return <div className="mt-1 space-y-1">{[['H', 'Hadir', 'green'], ['S', 'Sakit', 'amber'], ['I', 'Izin', 'brand'], ['A', 'Alpa', 'red']].map(([k, l, t]) => <div key={k} className="flex items-center gap-2 text-xs"><span className="w-10">{l}</span><Progress value={(Number(a[k]) / total) * 100} tone={t as 'green'} className="flex-1" /><span className="w-6 text-right">{String(a[k] ?? 0)}</span></div>)}</div>;
}
function SuperAdminHome() {
  const [o, setO] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/tenants/platform/overview').then(setO).catch(() => setO({})); }, []);
  if (!o) return <Loading />;
  const t = (o.totals as Dict) ?? {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lembaga" value={String(t.tenants ?? 0)} hint={`${t.active_tenants ?? 0} aktif`} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Pengguna" value={Number(t.users ?? 0).toLocaleString('id-ID')} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Siswa" value={Number(t.students ?? 0).toLocaleString('id-ID')} icon={<GraduationCap className="h-5 w-5" />} tone="purple" />
        <StatCard label="Aktif 7 hari" value={String(t.active_7d ?? 0)} icon={<Sparkles className="h-5 w-5" />} tone="green" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Lembaga per provinsi" className="lg:col-span-2">{(o.by_province as Dict[] | undefined)?.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={o.by_province as Dict[]}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="nama" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} /><Bar dataKey="c" name="Lembaga" fill="var(--brand-600)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="Belum ada lembaga" />}</Card>
        <Card title="Lembaga terbaru" action={<Link to="/superadmin/lembaga" className="text-xs text-brand-700">Kelola</Link>}>{(o.recent as Dict[] | undefined)?.length ? <ul className="divide-y divide-line">{(o.recent as Dict[]).map((r) => <li key={r.id as string}><Link to={`/superadmin/lembaga/${r.id}`} className="flex items-center justify-between py-2 text-sm hover:text-brand-700"><span>{r.name as string}<span className="block text-xs text-ink-3">{r.type as string} · {fmtDate(r.created_at as string)}</span></span><ArrowRight className="h-4 w-4 text-ink-3" /></Link></li>)}</ul> : <EmptyState title="Belum ada lembaga" action={<Link to="/superadmin/lembaga"><span className="link text-sm">Tambah lembaga</span></Link>} />}</Card>
      </div>
    </div>
  );
}
