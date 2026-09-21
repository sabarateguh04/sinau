import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, GraduationCap, Sparkles, ShieldCheck, WifiLow, Bot, BrainCircuit, Map, PenTool } from 'lucide-react';
import { useAuth, homeOf } from '@/store/auth';
import { Button, Field, Input } from '@/components/ui';
import { api, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { pickRole } from './pickRole';

export default function Login({ mode = 'login' }: { mode?: 'login' | 'reset' | 'invite' }) {
  const { login, user, activeRole } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fullName, setFullName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState<{ branding?: { display_name?: string; tagline?: string }; stats?: { tenants: number; students: number; materials: number } } | null>(null);
  useEffect(() => { api.get('/public/platform').then((r) => setPlatform(r.data.data)).catch(() => undefined); }, []);
  useEffect(() => { if (user && mode === 'login') nav(sp.get('next') || homeOf(activeRole), { replace: true }); }, [user, activeRole, nav, sp, mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        if (forgot) { await api.post('/auth/forgot-password', { email }); toast.success('Jika e-mail terdaftar, tautan reset sudah dikirim'); setForgot(false); }
        else { const me = await login(username.trim(), password); nav(sp.get('next') || homeOf(pickRole(me)), { replace: true }); }
      } else if (mode === 'reset') {
        if (password !== password2) throw { message: 'Konfirmasi kata sandi tidak sama' };
        await api.post('/auth/reset-password', { token: sp.get('token'), password });
        toast.success('Kata sandi diperbarui, silakan masuk'); nav('/login');
      } else {
        if (password !== password2) throw { message: 'Konfirmasi kata sandi tidak sama' };
        await api.post('/auth/accept-invitation', { token: sp.get('token'), username: username.trim(), password, full_name: fullName || undefined });
        toast.success('Akun dibuat, silakan masuk'); nav('/login');
      }
    } catch (err) { toast.error((err as { message?: string })?.message ?? toApiError(err).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-600/50 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent-500/30 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black">S</div><div><div className="text-xl font-extrabold tracking-tight">SINAU</div><div className="text-xs text-white/70">{platform?.branding?.tagline ?? 'Platform belajar & manajemen sekolah'}</div></div></div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide"><Sparkles className="h-3.5 w-3.5 text-accent-400" /> Learn. Teach. Improve. Grow.</div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">Satu platform, satu data belajar, satu lapisan intelijen.</h1>
          <p className="max-w-md text-sm text-white/80">Bukan LMS dengan chatbot. <b className="text-white">Alesha AI</b> membaca seluruh data belajar lalu mengubahnya menjadi pemahaman, rekomendasi, dan tindakan — untuk siswa, guru, dan lembaga.</p>
          <ul className="space-y-3 text-sm text-white/85">
            <li className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span><b className="text-white">Tutor pribadi 24 jam</b> — Explain, Simplify, Quiz Me, hingga mode Socratic saat tugas berjalan.</span></li>
            <li className="flex items-start gap-3"><Map className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span><b className="text-white">Absorption Heatmap</b> — nilai dipecah menjadi peta penyerapan per konsep, miskonsepsi kelas terdeteksi dini.</span></li>
            <li className="flex items-start gap-3"><PenTool className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span><b className="text-white">Asisten mengajar</b> — draf rancangan pembelajaran & soal berlabel miskonsepsi; AI mengusulkan, guru memutuskan.</span></li>
            <li className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span><b className="text-white">Analisis berakhir pada tindakan</b> — setiap wawasan menyebut jumlah bukti dan langkah konkret untuk besok.</span></li>
            <li className="flex items-start gap-3"><GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span>Materi, tugas, kuis, ujian, nilai, rapor, keuangan, PPDB — terhubung dalam satu data.</span></li>
            <li className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span>Data tiap lembaga terisolasi, izin per peran, privasi anak sebagai bawaan (UU PDP).</span></li>
            <li className="flex items-start gap-3"><WifiLow className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" /><span>Ringan di jaringan lemah, ada mode hemat data.</span></li>
          </ul>
          {platform?.stats && <div className="flex gap-8 pt-2 text-sm"><Stat n={platform.stats.tenants} l="lembaga" /><Stat n={platform.stats.students} l="siswa" /><Stat n={platform.stats.materials} l="materi" /></div>}
        </motion.div>
        <div className="relative text-xs text-white/60">© {new Date().getFullYear()} SINAU · <Link to="/welcome" className="underline">Portal publik</Link></div>
      </div>

      <div className="flex items-center justify-center bg-surface-2 px-5 py-10">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-md space-y-5 p-7 sm:p-9">
          <div className="lg:hidden flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 font-black text-white">S</div><span className="text-lg font-extrabold">SINAU</span></div>
          <div>
            <h2 className="text-2xl font-bold">{mode === 'login' ? (forgot ? 'Lupa kata sandi' : 'Masuk') : mode === 'reset' ? 'Atur ulang kata sandi' : 'Terima undangan'}</h2>
            <p className="mt-1 text-sm text-ink-2">{mode === 'login' ? (forgot ? 'Masukkan e-mail akun Anda.' : 'Gunakan nama pengguna dari sekolah/lembaga Anda.') : mode === 'reset' ? 'Buat kata sandi baru minimal 8 karakter.' : 'Tentukan nama pengguna dan kata sandi Anda.'}</p>
          </div>
          {mode === 'login' && !forgot && <>
            <Field label="Nama pengguna atau e-mail" required><Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mis. siswa.01" /></Field>
            <PasswordField label="Kata sandi" value={password} onChange={setPassword} show={show} setShow={setShow} autoComplete="current-password" />
            <div className="flex items-center justify-between text-xs"><button type="button" className="link" onClick={() => setForgot(true)}>Lupa kata sandi?</button><Link to="/welcome" className="text-ink-3 hover:text-ink">Lihat portal publik</Link></div>
          </>}
          {mode === 'login' && forgot && <>
            <Field label="E-mail" required><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <button type="button" className="link text-xs" onClick={() => setForgot(false)}>Kembali ke halaman masuk</button>
          </>}
          {mode === 'invite' && <>
            <Field label="Nama lengkap"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Nama pengguna" required hint="Huruf kecil, angka, titik, strip"><Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
          </>}
          {mode !== 'login' && <>
            <PasswordField label="Kata sandi baru" value={password} onChange={setPassword} show={show} setShow={setShow} autoComplete="new-password" />
            <PasswordField label="Ulangi kata sandi" value={password2} onChange={setPassword2} show={show} setShow={setShow} autoComplete="new-password" />
          </>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>{mode === 'login' ? (forgot ? 'Kirim tautan reset' : 'Masuk') : 'Simpan'}</Button>
          {mode === 'login' && <p className="text-center text-[11px] text-ink-3">Akun dibuat oleh admin lembaga. Belum punya akun? Hubungi sekolah Anda.</p>}
        </motion.form>
      </div>
    </div>
  );
}
const Stat = ({ n, l }: { n: number; l: string }) => <div><div className="text-2xl font-extrabold">{Number(n).toLocaleString('id-ID')}</div><div className="text-white/70">{l}</div></div>;
function PasswordField({ label, value, onChange, show, setShow, autoComplete }: { label: string; value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void; autoComplete: string }) {
  return (
    <Field label={label} required>
      <div className="relative">
        <Input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="pr-10" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
    </Field>
  );
}
