/**
 * Alesha AI — floating chat & voice assistant (engine dummy / demo).
 * Mounted once in AppShell (signed-in) and PublicLayout (public site). All intelligence sits behind
 * lib/alesha.ts so the real engine can be swapped without touching this UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AudioLines, Loader2, MessageSquare, Mic, MicOff, RotateCcw, Send, Sparkles, Volume2, VolumeX, X, BookOpenCheck } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { ALESHA_NAME, ALESHA_STORAGE_KEY, askAlesha, aleshaStatus, hasBrowserSpeech, hasBrowserTts, listen, speak, type AleshaTurn, type Listener, type TutorMode } from '@/lib/alesha';
import { cx } from '@/components/ui';

type Mode = 'chat' | 'voice';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Msg extends AleshaTurn { id: string; suggestions?: string[]; sources?: string[]; engine?: string }
const uid = () => Math.random().toString(36).slice(2, 10);
const STUDENT_MODES: { key: TutorMode; label: string }[] = [{ key: 'explain', label: 'Explain' }, { key: 'simplify', label: 'Simplify' }, { key: 'example', label: 'Contoh' }, { key: 'why', label: 'Kenapa?' }, { key: 'quiz', label: 'Quiz me' }, { key: 'challenge', label: 'Tantang' }, { key: 'review', label: 'Ulas' }, { key: 'exam', label: 'Ujian' }, { key: 'socratic', label: 'Socratic' }];

const welcome = (name?: string | null, role?: string | null): Msg => {
  const n = name ? `, ${name.split(' ')[0]}` : '';
  const by: Record<string, [string, string[]]> = {
    SISWA: ['Aku bisa mengingatkan tugas, menunjukkan konsep yang masih lemah, mengulang materi, atau mengujimu lewat "Quiz me".', ['Tugas apa yang mendekati tenggat?', 'Konsep mana yang masih lemah?', 'Quiz me!']],
    WALI_MURID: ['Saya bisa merangkum perkembangan anak Anda: capaian konsep, kehadiran, dan tagihan.', ['Bagaimana perkembangan anak saya?', 'Kehadiran anak saya', 'Tagihan anak saya']],
    GURU: ['Saya bisa merangkum insight kelas, menyusun draf rancangan pembelajaran, dan menyiapkan draf soal berlabel miskonsepsi.', ['Insight kelas saya', 'Rancang pembelajaran tentang persamaan linear', 'Tugas yang belum dinilai']],
  };
  const [intro, sugg] = by[role ?? ''] ?? (role ? ['Saya bisa merangkum kondisi lembaga hari ini, tunggakan tagihan, dan hal yang menunggu persetujuan.', ['Ringkasan sekolah hari ini', 'Berapa tunggakan tagihan?', 'Apa itu SINAU?']] : ['Saya bisa menjelaskan SINAU, PPDB, berita lembaga, dan cara masuk.', ['Apa itu SINAU?', 'PPDB sedang dibuka?', 'Berita terbaru']]);
  return { id: 'welcome', role: 'assistant', content: `Halo${n}! Saya ${ALESHA_NAME}, lapisan intelijen SINAU. ${intro}`, suggestions: sugg };
};
const load = (): Msg[] => { try { const raw = sessionStorage.getItem(ALESHA_STORAGE_KEY); return raw ? (JSON.parse(raw) as Msg[]) : []; } catch { return []; } };
const save = (m: Msg[]) => { try { sessionStorage.setItem(ALESHA_STORAGE_KEY, JSON.stringify(m.slice(-40))); } catch { /* ignore */ } };

/** **bold**, _italic_ and line breaks from the assistant's plain-text reply. */
function RichText({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => <span key={i} className="block min-h-[1em]">{line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={j} className="text-ink-3">{p.slice(1, -1)}</em> : <span key={j}>{p}</span>)}</span>)}</>;
}
const Face = ({ className }: { className?: string }) => <span className={cx('flex items-center justify-center rounded-full bg-gradient-to-tr from-brand-700 via-brand-500 to-accent-500 text-white', className)}><Sparkles className="h-[55%] w-[55%]" /></span>;

export function AleshaWidget() {
  const loc = useLocation();
  const { user, activeRole, feature } = useAuth();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');
  const [tutor, setTutor] = useState<TutorMode | undefined>(undefined);
  const [messages, setMessages] = useState<Msg[]>(() => { const s = load(); return s.length ? s : [welcome(user?.full_name, activeRole)]; });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [engine, setEngine] = useState('dummy');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [ttsOn, setTtsOn] = useState(true);
  const stateRef = useRef<Record<string, unknown> | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const stopSpeakRef = useRef<() => void>(() => undefined);
  const listenTarget = useRef<'input' | 'voice'>('voice');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tenantSlug = useMemo(() => /^\/(?:s|ppdb)\/([^/]+)/.exec(loc.pathname)?.[1] ?? user?.tenant?.slug, [loc.pathname, user?.tenant?.slug]);
  const context = useMemo(() => ({ page: loc.pathname, tenant_slug: tenantSlug, mode: tutor }), [loc.pathname, tenantSlug, tutor]);

  useEffect(() => { aleshaStatus().then((s) => s && setEngine(s.engine)); }, []);
  useEffect(() => save(messages), [messages]);
  useEffect(() => { if (open && mode === 'chat') { endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); inputRef.current?.focus(); } }, [messages, thinking, open, mode, reduce]);
  useEffect(() => { if (open) return; listenerRef.current?.stop(); stopSpeakRef.current(); setVoiceState('idle'); }, [open]);
  useEffect(() => () => { listenerRef.current?.stop(); stopSpeakRef.current(); }, []);
  // a new login resets the persona
  useEffect(() => { setMessages((m) => (m.length === 1 && m[0].id === 'welcome' ? [welcome(user?.full_name, activeRole)] : m)); }, [user?.id, activeRole, user?.full_name]);

  const send = useCallback(async (text: string, viaVoice = false) => {
    const content = text.trim(); if (!content || thinking) return;
    setInput('');
    const history = messages.filter((m) => m.id !== 'welcome').map(({ role, content: c }) => ({ role, content: c }));
    setMessages((p) => [...p, { id: uid(), role: 'user', content }]);
    setThinking(true); if (viaVoice) setVoiceState('thinking');
    const res = await askAlesha(content, history, { ...context, state: stateRef.current });
    stateRef.current = res.state ?? null; setEngine(res.engine);
    setMessages((p) => [...p, { id: uid(), role: 'assistant', content: res.reply, suggestions: res.suggestions, sources: res.sources, engine: res.engine }]);
    setThinking(false);
    if (viaVoice && ttsOn && hasBrowserTts()) { setVoiceState('speaking'); stopSpeakRef.current = speak(res.reply, () => setVoiceState('idle')); } else if (viaVoice) setVoiceState('idle');
  }, [messages, thinking, context, ttsOn]);

  const startListening = useCallback((target: 'input' | 'voice') => {
    if (voiceState === 'listening') { listenerRef.current?.stop(); return; }
    stopSpeakRef.current(); listenTarget.current = target; setVoiceError(null); setTranscript(''); setVoiceState('listening');
    listenerRef.current = listen({ onInterim: setTranscript, onResult: (t) => { setTranscript(t); if (listenTarget.current === 'input') { setInput(t); setVoiceState('idle'); } else void send(t, true); }, onError: (m) => { setVoiceError(m); setVoiceState('idle'); }, onEnd: () => setVoiceState((s) => (s === 'listening' ? 'idle' : s)) });
  }, [voiceState, send]);

  const reset = () => { listenerRef.current?.stop(); stopSpeakRef.current(); stateRef.current = null; setMessages([welcome(user?.full_name, activeRole)]); setTranscript(''); setVoiceState('idle'); setVoiceError(null); };
  if (user && !feature('alesha', true)) return null;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const voiceLabel: Record<VoiceState, string> = { idle: 'Ketuk mikrofon lalu bicara', listening: 'Mendengarkan…', thinking: `${ALESHA_NAME} sedang berpikir…`, speaking: `${ALESHA_NAME} menjawab…` };
  const listeningInput = voiceState === 'listening' && listenTarget.current === 'input';

  return (
    <>
      <div className="group fixed bottom-5 right-5 z-40 flex items-center print:hidden">
        <div className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 translate-x-2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-all group-hover:translate-x-0 group-hover:opacity-100 dark:bg-surface-3 dark:text-ink">
          <p className="font-bold">{ALESHA_NAME} AI <span className="ml-1 rounded bg-white/15 px-1 py-0.5 text-[9px] font-semibold">Intelligence Layer</span></p>
          <p className="mt-0.5 text-[10px] opacity-70">Tutor · asisten mengajar · analis belajar · mode demo</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Tutup Alesha' : 'Buka Alesha'} aria-expanded={open} className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-transform hover:scale-110 active:scale-95">
          {!open && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" /></span>}
          {open ? <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white"><X className="h-6 w-6" /></span> : <Face className="h-14 w-14" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.section key="alesha" role="dialog" aria-label={ALESHA_NAME} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface shadow-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[620px] sm:max-h-[calc(100vh-7rem)] sm:w-[390px] sm:rounded-2xl sm:border sm:border-line print:hidden">
            <header className="flex items-center gap-3 bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 px-4 py-3 text-white">
              <Face className="h-10 w-10 shrink-0 ring-2 ring-white/60" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">{ALESHA_NAME} <span className="text-xs font-normal text-white/80">· Intelligence Layer</span></p>
                <p className="flex items-center gap-1.5 text-[11px] text-white/85"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />{engine === 'alesha' ? 'Terhubung ke engine Alesha' : 'Mode demo · menjawab dari data lembaga Anda'}</p>
              </div>
              <button type="button" onClick={reset} title="Percakapan baru" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={() => setOpen(false)} title="Tutup" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white sm:hidden"><X className="h-4 w-4" /></button>
            </header>
            <div className="grid grid-cols-2 gap-1 border-b border-line bg-surface-2 p-1.5">
              {([['chat', 'Chat', MessageSquare], ['voice', 'Suara', AudioLines]] as const).map(([k, l, I]) => <button key={k} type="button" onClick={() => setMode(k)} className={cx('flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', mode === k ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-3 hover:text-ink')}><I className="h-3.5 w-3.5" /> {l}</button>)}
            </div>
            {activeRole === 'SISWA' && mode === 'chat' && (
              <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 text-[11px]">
                <span className="flex shrink-0 items-center gap-1 pr-1 text-ink-3"><BookOpenCheck className="h-3.5 w-3.5" />Mode</span>
                {STUDENT_MODES.map((m) => <button key={m.key} type="button" onClick={() => setTutor((t) => (t === m.key ? undefined : m.key))} className={cx('shrink-0 rounded-full border px-2 py-0.5 font-medium transition-colors', tutor === m.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-ink-2 hover:bg-surface-3')}>{m.label}</button>)}
              </div>
            )}
            {mode === 'chat' ? (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    return (
                      <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={cx('max-w-[88%]', m.role === 'assistant' && 'flex items-end gap-2')}>
                          {m.role === 'assistant' && <Face className="mb-0.5 h-7 w-7 shrink-0" />}
                          <div>
                            <div className={cx('rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md bg-surface-2 text-ink')}><RichText text={m.content} /></div>
                            {m.role === 'assistant' && m.sources?.length ? <p className="mt-1 pl-1 text-[10px] text-ink-3">{m.sources.join(' · ')}</p> : null}
                            {m.role === 'assistant' && isLast && !thinking && m.suggestions?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{m.suggestions.map((s) => <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-brand-200 bg-surface px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-900/40">{s}</button>)}</div> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {thinking && <div className="flex items-end gap-2"><Face className="h-7 w-7" /><div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 120}ms` }} />)}</div></div>}
                  <div ref={endRef} />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-center gap-2 border-t border-line p-3">
                  <button type="button" onClick={() => startListening('input')} title={hasBrowserSpeech() ? 'Bicara untuk mengetik' : 'Mikrofon (simulasi — browser tidak mendukung Web Speech)'} className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors', listeningInput ? 'border-red-300 bg-red-50 text-red-600' : 'border-line text-ink-3 hover:bg-surface-2')}>{listeningInput ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
                  <input ref={inputRef} value={listeningInput ? transcript || input : input} onChange={(e) => setInput(e.target.value)} placeholder={listeningInput ? 'Mendengarkan…' : tutor ? `Mode ${STUDENT_MODES.find((m) => m.key === tutor)?.label}: tulis topik…` : 'Tulis pertanyaan…'} className="input h-10 min-w-0 flex-1" />
                  <button type="submit" disabled={!input.trim() || thinking} aria-label="Kirim" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40">{thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center overflow-y-auto px-5 py-6 text-center">
                <div className="relative mt-2 flex h-40 w-40 items-center justify-center">
                  {(voiceState === 'listening' || voiceState === 'speaking') && !reduce && <><span className={cx('absolute inset-0 animate-ping rounded-full', voiceState === 'listening' ? 'bg-red-400/30' : 'bg-brand-400/30')} style={{ animationDuration: '1.6s' }} /><span className={cx('absolute inset-4 animate-ping rounded-full', voiceState === 'listening' ? 'bg-red-400/30' : 'bg-brand-400/30')} style={{ animationDuration: '1.6s', animationDelay: '0.4s' }} /></>}
                  <Face className="relative h-32 w-32 ring-4 ring-surface shadow-xl" />
                </div>
                <p className="mt-5 text-sm font-semibold">{voiceLabel[voiceState]}</p>
                <p className="mt-1 min-h-[2.5rem] px-2 text-sm text-ink-2">{voiceState === 'listening' || voiceState === 'thinking' ? (transcript ? `“${transcript}”` : '…') : lastAssistant && lastAssistant.id !== 'welcome' ? <RichText text={lastAssistant.content} /> : 'Tanyakan tentang tugas, konsep yang lemah, atau minta "quiz me".'}</p>
                {voiceError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">{voiceError}</p>}
                {!hasBrowserSpeech() && <p className="mt-2 text-[11px] text-amber-600">Browser ini tidak mendukung pengenalan suara — transkrip disimulasikan.</p>}
                <div className="mt-auto flex w-full items-center justify-center gap-6 pt-6">
                  <button type="button" onClick={() => setTtsOn((v) => !v)} title={ttsOn ? 'Matikan suara balasan' : 'Nyalakan suara balasan'} className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 hover:bg-surface-2">{ttsOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
                  <button type="button" onClick={() => startListening('voice')} disabled={voiceState === 'thinking'} aria-label={voiceState === 'listening' ? 'Berhenti' : 'Mulai bicara'} className={cx('flex h-20 w-20 items-center justify-center rounded-full text-white shadow-2xl transition-transform active:scale-95 disabled:opacity-50', voiceState === 'listening' ? 'bg-red-500 hover:bg-red-400' : 'bg-gradient-to-tr from-brand-700 via-brand-500 to-accent-500 hover:scale-105')}>{voiceState === 'thinking' ? <Loader2 className="h-8 w-8 animate-spin" /> : voiceState === 'listening' ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}</button>
                  <button type="button" onClick={() => { stopSpeakRef.current(); setVoiceState('idle'); }} disabled={voiceState !== 'speaking'} title="Hentikan suara" className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-3 hover:bg-surface-2 disabled:opacity-40"><X className="h-5 w-5" /></button>
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-wider text-ink-3">Mode demo · STT/TTS browser</p>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
