/**
 * Alesha AI client — chat + voice helpers for components/AleshaWidget.tsx.
 *
 * Chat goes through POST /api/v1/alesha/chat (dummy engine on the backend that answers from real
 * tenant data). Voice is done in the browser: STT via Web Speech API when available, otherwise a
 * simulated transcript; TTS via speechSynthesis.
 *
 * TODO(engine): swap `askAlesha` for a streaming (SSE) call and the browser STT/TTS for the real
 * Alesha voice pipeline — the widget only depends on the small interfaces below.
 */
import { api } from './api';

export interface AleshaTurn { role: 'user' | 'assistant'; content: string }
export type TutorMode = 'explain' | 'simplify' | 'example' | 'why' | 'practice' | 'quiz' | 'challenge' | 'review' | 'exam' | 'socratic';
export interface AleshaContext { page?: string; tenant_slug?: string; mode?: TutorMode; material_title?: string | null; state?: Record<string, unknown> | null }
export interface AleshaReply { reply: string; suggestions: string[]; sources: string[]; mode: TutorMode | null; engine: 'dummy' | 'alesha'; latency_ms: number; state?: Record<string, unknown> | null }
export interface AleshaStatus { name: string; engine: string; voice: string; ready: boolean; modes: { key: TutorMode; label: string; desc: string }[] }

export const ALESHA_NAME = 'Alesha';
export const ALESHA_STORAGE_KEY = 'sinau.alesha.chat';
const OFFLINE: AleshaReply = { reply: 'Maaf, Alesha sedang tidak terhubung ke server. Coba lagi beberapa saat lagi.', suggestions: [], sources: [], mode: null, engine: 'dummy', latency_ms: 0 };

export async function askAlesha(message: string, history: AleshaTurn[], context: AleshaContext): Promise<AleshaReply> {
  try { return (await api.post<{ data: AleshaReply }>('/alesha/chat', { message, history: history.slice(-20), context })).data.data; } catch { return OFFLINE; }
}
export async function aleshaStatus(): Promise<AleshaStatus | null> {
  try { return (await api.get<{ data: AleshaStatus }>('/alesha/status')).data.data; } catch { return null; }
}

/* ── Voice: speech-to-text ── */
interface BrowserSpeechRecognition {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Ctor = new () => BrowserSpeechRecognition;
const speechCtor = (): Ctor | null => { const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };
export const hasBrowserSpeech = () => typeof window !== 'undefined' && speechCtor() !== null;
export const hasBrowserTts = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
const SIMULATED = ['Tugas apa yang mendekati tenggat?', 'Konsep mana yang masih lemah?', 'Apa itu SINAU?', 'Quiz me!'];
export interface Listener { stop: () => void }

/** Starts listening; final transcript via onResult, partial via onInterim. Simulated when no speech API. */
export function listen(h: { onInterim?: (t: string) => void; onResult: (t: string) => void; onError?: (m: string) => void; onEnd?: () => void }): Listener {
  const C = speechCtor();
  if (!C) {
    const sample = SIMULATED[Math.floor(Math.random() * SIMULATED.length)]; const words = sample.split(' '); let i = 0;
    const tick = window.setInterval(() => { i++; h.onInterim?.(words.slice(0, i).join(' ')); if (i >= words.length) { window.clearInterval(tick); h.onResult(sample); h.onEnd?.(); } }, 220);
    return { stop: () => { window.clearInterval(tick); h.onEnd?.(); } };
  }
  const rec = new C(); rec.lang = 'id-ID'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e) => { let interim = ''; for (let i = 0; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; } h.onInterim?.((final + ' ' + interim).trim()); };
  rec.onerror = (e) => h.onError?.(e.error === 'not-allowed' ? 'Izin mikrofon ditolak. Aktifkan akses mikrofon di browser.' : `Mikrofon: ${e.error}`);
  rec.onend = () => { if (final.trim()) h.onResult(final.trim()); h.onEnd?.(); };
  try { rec.start(); } catch { h.onError?.('Mikrofon tidak dapat dimulai.'); h.onEnd?.(); }
  return { stop: () => rec.stop() };
}

/** Speaks text in Indonesian; returns a cancel function. */
export function speak(text: string, onEnd?: () => void): () => void {
  if (!hasBrowserTts()) { onEnd?.(); return () => undefined; }
  const synth = window.speechSynthesis; synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*|__|_/g, '').replace(/^[•\-\d.]+\s*/gm, ''));
  u.lang = 'id-ID'; u.rate = 1;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('id')); if (voice) u.voice = voice;
  u.onend = () => onEnd?.(); u.onerror = () => onEnd?.();
  synth.speak(u);
  return () => synth.cancel();
}
