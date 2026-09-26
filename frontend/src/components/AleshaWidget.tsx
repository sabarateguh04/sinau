/**
 * Alesha AI — floating chat & voice assistant.
 * Styled specifically for public visitors on /welcome and /portal with user_umum role.
 * Features:
 * - Real backend streaming chat integration with Jarvis/Alexa
 * - Strict limit of 5 prompts/questions for public visitors on /welcome and /portal
 * - Clear notification & call-to-action to login once limit of 5 is reached
 * - Strict guardrail: No document upload in chatbot mode
 * - Page context awareness: /welcome (features & platform overview) vs /portal (materials)
 * - Identical 3D Avatar Voice Kiosk modal from logged-in user version
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getDeviceId } from '../lib/deviceFingerprint';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AudioLines,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Bot,
  ArrowRight,
  BookOpen,
  HelpCircle,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { ALESHA_NAME, ALESHA_STORAGE_KEY, hasBrowserSpeech, hasBrowserTts, listen, speak, type Listener } from '@/lib/alesha';
import { cx } from '@/components/ui';
import { AleshaKioskModal } from './AleshaKioskModal';

type Mode = 'chat' | 'voice';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  sources?: string[];
  engine?: string;
  showPortalLink?: boolean;
  showLoginLink?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const PUBLIC_PROMPT_LIMIT = 5;

const getWelcomeMsg = (pathname: string, userName?: string | null): Msg => {
  const isPortal = pathname.startsWith('/portal');
  const greeting = userName ? `, ${userName.split(' ')[0]}` : '';

  if (isPortal) {
    return {
      id: 'welcome',
      role: 'assistant',
      content: `Halo${greeting}! 👋 Selamat datang di **Portal Materi Publik SINAU**.\n\nSaya **Alesha**, asisten cerdas yang siap memandu Anda menemukan materi pelajaran terbuka, modul ajar gratis, dan silabus yang dibagikan oleh berbagai lembaga. Apa materi yang ingin Anda pelajari hari ini?`,
      suggestions: [
        'Materi apa saja yang tersedia di portal ini?',
        'Apakah materi di portal ini gratis diakses?',
        'Ada materi untuk SMK jurusan RPL atau TKJ?',
        'Bagaimana cara membaca materi di sini?',
      ],
    };
  }

  return {
    id: 'welcome',
    role: 'assistant',
    content: `Halo${greeting}! 👋 Selamat datang di **SINAU**.\n\nSaya **Alesha**, asisten cerdas platform ini. Saya siap menjelaskan fitur-fitur pembelajaran, keunggulan sistem, alur PPDB, serta informasi lembaga di SINAU. Ada yang ingin Anda ketahui seputar SINAU?`,
    suggestions: [
      'Apa saja fitur utama di SINAU?',
      'Bagaimana alur pembelajaran di SINAU?',
      'Apa itu Absorption Heatmap?',
      'Bagaimana peran Guru & Siswa di SINAU?',
    ],
  };
};

// Public visitors on /welcome and /portal start with a fresh session without old history
const loadMessages = (pathname: string, userName?: string | null): Msg[] => {
  return [getWelcomeMsg(pathname, userName)];
};

const saveMessages = (_m: Msg[]) => {
  // Deliberately reset: do not persist conversation history across page sessions for /welcome & /portal
};

/** Parser format inline: **bold**, *italic*, `code`, [link](url) */
function parseInline(text: string, onAction?: (prompt: string) => void): React.ReactNode {
  if (!text) return '';
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*|_[^_]+?_|\[action:[^\|\]]+(?:\|[^\]]*)?\]|\[[^\]]+\]\s*\([^)\s]+\))/g);

  return parts.map((part, index) => {
    const actionMatch = part.match(/^\[action:([^\|\]]+)(?:\|([^\]]*))?\]$/);
    if (actionMatch) {
      const label = actionMatch[1].trim();
      const prompt = (actionMatch[2] || label).trim();
      return (
        <button
          key={index}
          type="button"
          onClick={() => onAction && onAction(prompt)}
          className="my-1 mr-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-accent-500/15 hover:from-brand-500/25 hover:to-accent-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 text-xs font-semibold shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" />
          <span>{label}</span>
        </button>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-ink dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-surface-3 font-mono text-[11px] text-brand-700 dark:text-brand-300 border border-line/50"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={index} className="italic text-ink-2">
          {part.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\s*\(([^)\s]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:text-brand-800 underline font-medium inline-flex items-center gap-1 dark:text-brand-400"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function renderTableCell(cell: string): React.ReactNode {
  const trimmed = cell.trim();
  const lower = trimmed.toLowerCase();

  // Status Badge: Teks, Video, PDF, Dokumen
  if (['teks', 'text', 'artikel', 'bacaan'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
        📄 {trimmed}
      </span>
    );
  }
  if (['video', 'mp4', 'youtube'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">
        🎥 {trimmed}
      </span>
    );
  }
  if (['pdf', 'ebook', 'modul'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">
        📕 {trimmed}
      </span>
    );
  }
  if (['aktif', 'active', 'sukses', 'lengkap', 'terbuka'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
        ✓ {trimmed}
      </span>
    );
  }

  // Dash/empty placeholder
  if (trimmed === '—' || trimmed === '-' || trimmed === 'N/A') {
    return <span className="text-ink-2/40 italic">—</span>;
  }

  // Number / ordinal (e.g. 1, 2, 3)
  if (/^\d+$/.test(trimmed)) {
    return <span className="font-semibold text-brand-700 dark:text-brand-300">{trimmed}</span>;
  }

  return parseInline(trimmed);
}

function renderTable(rows: string[][], key: string | number) {
  if (!rows || rows.length === 0) return null;
  const header = rows[0];
  const body = rows.slice(1);

  return (
    <div key={key} className="my-2.5 rounded-xl border border-line/80 overflow-hidden shadow-xs bg-surface-1">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 text-white px-3 py-1.5 flex items-center justify-between text-[11px] font-medium">
        <span className="flex items-center gap-1.5 font-semibold">
          <BookOpen className="w-3 h-3 text-brand-300" />
          <span>Tabel Informasi Materi</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-mono">
          {body.length} item
        </span>
      </div>

      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-surface-2/90 border-b border-line text-ink font-semibold text-[11px]">
              {header.map((h, i) => (
                <th key={i} className="py-2 px-2.5 border-r last:border-r-0 border-line/40 whitespace-nowrap">
                  {parseInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {body.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-brand-500/5 transition-colors odd:bg-surface-1 even:bg-surface-2/50">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-2.5 border-r last:border-r-0 border-line/30 text-ink leading-snug">
                    {renderTableCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** RichText with full Markdown parsing: Tables, Badges, Lists, Quotes, Headings, and Code */
function RichText({ text, onAction }: { text: string; onAction?: (prompt: string) => void }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Action button on single line: [action:Label|Prompt] or [action:Label]
    const actionMatch = trimmed.match(/^\[action:([^\|\]]+)(?:\|([^\]]*))?\]$/);
    if (actionMatch) {
      const label = actionMatch[1].trim();
      const prompt = (actionMatch[2] || label).trim();
      elements.push(
        <div key={`act-${i}`} className="my-2">
          <button
            type="button"
            onClick={() => onAction && onAction(prompt)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-500/15 via-brand-500/10 to-accent-500/15 hover:from-brand-500/25 hover:to-accent-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 text-xs font-semibold shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span>{label}</span>
          </button>
        </div>
      );
      continue;
    }

    // Code block ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="p-2.5 my-2 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed shadow-inner">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Markdown Table Line: | Col 1 | Col 2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Divider row |--|---|
      if (cells.every((c) => /^[-:\s]+$/.test(c))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableRows = [cells];
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      elements.push(renderTable(tableRows, `table-${i}`));
      inTable = false;
      tableRows = [];
    }

    // Horizontal Rule: ---
    if (/^_{3,}$|^-{3,}$|^\*{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="my-2 border-line/60" />);
      continue;
    }

    // Heading: ### or ## or #
    if (trimmed.startsWith('#')) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const headingText = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <p key={`h-${i}`} className={cx('font-bold text-ink mt-2 mb-1', level <= 2 ? 'text-sm' : 'text-xs')}>
          {parseInline(headingText, onAction)}
        </p>
      );
      continue;
    }

    // Blockquote: >
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={`q-${i}`} className="pl-3 border-l-2 border-brand-500 italic text-ink-2 my-1 text-xs bg-brand-500/5 py-1 rounded-r">
          {parseInline(quoteText, onAction)}
        </blockquote>
      );
      continue;
    }

    // Numbered list item: 1. Item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2 my-1 text-xs">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[10px] font-bold text-brand-700 dark:text-brand-300">
            {numMatch[1]}
          </span>
          <div className="flex-1 leading-relaxed pt-0.5">{parseInline(numMatch[2], onAction)}</div>
        </div>
      );
      continue;
    }

    // Bullet list item: - Item or * Item
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 my-0.5 text-xs">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
          <div className="flex-1 leading-relaxed">{parseInline(bulletMatch[1], onAction)}</div>
        </div>
      );
      continue;
    }

    // Empty line
    if (!trimmed) {
      elements.push(<span key={`empty-${i}`} className="block h-1.5" />);
      continue;
    }

    // Standard paragraph line
    elements.push(
      <p key={`p-${i}`} className="min-h-[1.2em] leading-relaxed">
        {parseInline(rawLine, onAction)}
      </p>
    );
  }

  // Flush remaining table
  if (inTable && tableRows.length > 0) {
    elements.push(renderTable(tableRows, 'table-end'));
  }

  return <div className="space-y-1 text-xs sm:text-sm">{elements}</div>;
}

const Face = ({ className }: { className?: string }) => (
  <span
    className={cx(
      'flex items-center justify-center rounded-full bg-gradient-to-tr from-brand-700 via-brand-500 to-accent-500 text-white shadow-xs',
      className
    )}
  >
    <Sparkles className="h-[55%] w-[55%]" />
  </span>
);

export function AleshaWidget() {
  const loc = useLocation();
  const { user, activeRole } = useAuth();
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => loadMessages(loc.pathname, user?.full_name));
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [ttsOn, setTtsOn] = useState(true);

  // Track interaction count for public visitor (Authoritative 5-limit per device IP)
  const [promptCount, setPromptCount] = useState<number>(0);

  const sessionIdRef = useRef<string>(
    typeof window !== 'undefined'
      ? sessionStorage.getItem('sinau_alesha_public_session') || `session-guest-${Date.now()}`
      : `session-guest-${Date.now()}`
  );

  const listenerRef = useRef<Listener | null>(null);
  const stopSpeakRef = useRef<() => void>(() => undefined);
  const listenTarget = useRef<'input' | 'voice'>('voice');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPortal = loc.pathname.startsWith('/portal');
  const isWelcome = loc.pathname.startsWith('/welcome') || loc.pathname === '/';
  const isLimitReached = promptCount >= PUBLIC_PROMPT_LIMIT;

  // Persist session ID
  useEffect(() => {
    try {
      sessionStorage.setItem('sinau_alesha_public_session', sessionIdRef.current);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => saveMessages(messages), [messages]);

  // Sync device quota from backend (tied to device IP across all browsers / tabs / incognito)
  const syncDeviceQuota = useCallback(async () => {
    try {
      const aleshaApiBase = (import.meta as any).env?.VITE_ALESHA_API_URL || 'http://localhost:8000';
      const res = await fetch(`${aleshaApiBase}/api/chat/sinau/public-quota?mode=chat`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.prompt_count === 'number') {
          setPromptCount(data.prompt_count);
        }
      }
    } catch (err) {
      console.warn('[AleshaWidget] Error syncing device quota:', err);
    }
  }, []);

  useEffect(() => {
    syncDeviceQuota();
  }, [syncDeviceQuota]);

  // Quotas are strictly separate: Chatbot mode (5/5) and Avatar Voice mode (5/5)
  // Avatar Kiosk events do NOT consume Chatbot quota
  useEffect(() => {
    const handleKioskEvent = (_event: MessageEvent) => {
      // Independent quota tracking per mode
    };
    window.addEventListener('message', handleKioskEvent);
    return () => window.removeEventListener('message', handleKioskEvent);
  }, []);

  useEffect(() => {
    if (open && mode === 'chat') {
      endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      if (!isLimitReached) {
        inputRef.current?.focus();
      }
    }
  }, [messages, thinking, open, mode, reduce, isLimitReached]);

  useEffect(() => {
    if (open) return;
    listenerRef.current?.stop();
    stopSpeakRef.current();
    setVoiceState('idle');
  }, [open]);

  useEffect(() => () => {
    listenerRef.current?.stop();
    stopSpeakRef.current();
  }, []);

  // Reset or adjust welcome message when pathname changes between welcome and portal
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [getWelcomeMsg(loc.pathname, user?.full_name)];
      }
      return prev;
    });
  }, [loc.pathname, user?.full_name]);

  const send = useCallback(
    async (text: string, viaVoice = false) => {
      const content = text.trim();
      if (!content || thinking) return;

      // Check 5-prompt limit before processing
      if (promptCount >= PUBLIC_PROMPT_LIMIT) {
        setMessages((p) => [
          ...p,
          {
            id: uid(),
            role: 'assistant',
            content:
              'Anda telah mencapai batas **5 pertanyaan** untuk pengunjung umum di halaman ini.\n\nSilakan **masuk (login)** ke akun SINAU Anda agar dapat melanjutkan interaksi dan menikmati seluruh kecerdasan Alesha AI tanpa batasan kuota.',
            showLoginLink: true,
          },
        ]);
        return;
      }

      setInput('');
      const userMsgId = uid();
      setMessages((p) => [...p, { id: userMsgId, role: 'user', content }]);
      setThinking(true);
      if (viaVoice) setVoiceState('thinking');

      const aleshaApiBase = (import.meta as any).env?.VITE_ALESHA_API_URL || 'http://localhost:8000';

      try {
        const payload = {
          message: content,
          mode: 'chat',
          user_role: activeRole || user?.roles?.[0] || 'user_umum',
          target_role: 'user_umum',
          current_page: loc.pathname,
          current_menu: isPortal ? 'Portal Materi Publik' : 'Halaman Pengenalan SINAU',
          session_id: sessionIdRef.current,
        };

        const res = await fetch(`${aleshaApiBase}/api/chat/sinau`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        let reply = data.reply || data.response || data.message || 'Informasi sedang diproses.';
        const suggestions = data.suggestions || (isPortal ? [
          'Bagaimana cara melihat isi materi?',
          'Apakah ada materi pelajaran lainnya?',
        ] : [
          'Bagaimana cara mendaftar ke SINAU?',
          'Apa itu fitur AI tutor Alesha?',
        ]);

        const nextCount = typeof data.prompt_count === 'number' ? data.prompt_count : promptCount + 1;
        setPromptCount(nextCount);

        const limitReachedFromBackend = Boolean(data.limit_reached || nextCount >= PUBLIC_PROMPT_LIMIT);
        const showPortalLink = isWelcome && (
          reply.toLowerCase().includes('portal') ||
          reply.toLowerCase().includes('/portal') ||
          reply.toLowerCase().includes('materi publik')
        );

        if (limitReachedFromBackend && !data.limit_reached) {
          reply = `${reply}\n\n---\nℹ️ *Ini adalah interaksi ke-5 Anda sebagai pengunjung umum. Untuk melanjutkan konsultasi berikutnya, silakan masuk (login) ke akun SINAU Anda.*`;
        }

        setMessages((p) => [
          ...p,
          {
            id: uid(),
            role: 'assistant',
            content: reply,
            suggestions: limitReachedFromBackend ? [] : suggestions,
            engine: 'alesha',
            showPortalLink,
            showLoginLink: limitReachedFromBackend,
          },
        ]);
        setThinking(false);

        if (viaVoice && ttsOn && hasBrowserTts()) {
          setVoiceState('speaking');
          stopSpeakRef.current = speak(reply, () => setVoiceState('idle'));
        } else if (viaVoice) {
          setVoiceState('idle');
        }
      } catch (err) {
        console.warn('[AleshaWidget] Error connecting to Alesha AI:', err);
        setMessages((p) => [
          ...p,
          {
            id: uid(),
            role: 'assistant',
            content:
              'Mohon maaf, saat ini asisten Alesha sedang dalam proses pembaruan data sistem. Silakan coba kembali sesaat lagi.',
            suggestions: isPortal ? ['Materi publik apa saja yang ada?'] : ['Apa saja fitur SINAU?'],
          },
        ]);
        setThinking(false);
        if (viaVoice) setVoiceState('idle');
      }
    },
    [thinking, activeRole, user, loc.pathname, isPortal, isWelcome, ttsOn, promptCount]
  );

  const startListening = useCallback(
    (target: 'input' | 'voice') => {
      if (promptCount >= PUBLIC_PROMPT_LIMIT) return;

      if (voiceState === 'listening') {
        listenerRef.current?.stop();
        return;
      }
      stopSpeakRef.current();
      listenTarget.current = target;
      setVoiceError(null);
      setTranscript('');
      setVoiceState('listening');

      listenerRef.current = listen({
        onInterim: setTranscript,
        onResult: (t) => {
          setTranscript(t);
          if (listenTarget.current === 'input') {
            setInput(t);
            setVoiceState('idle');
          } else {
            void send(t, true);
          }
        },
        onError: (m) => {
          setVoiceError(m);
          setVoiceState('idle');
        },
        onEnd: () => setVoiceState((s) => (s === 'listening' ? 'idle' : s)),
      });
    },
    [voiceState, send, promptCount]
  );

  const reset = () => {
    listenerRef.current?.stop();
    stopSpeakRef.current();
    sessionIdRef.current = `session-guest-${Date.now()}`;
    setMessages([getWelcomeMsg(loc.pathname, user?.full_name)]);
    setTranscript('');
    setVoiceState('idle');
    setVoiceError(null);
    // Refresh device quota from backend without resetting the counter
    void syncDeviceQuota();
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const listeningInput = voiceState === 'listening' && listenTarget.current === 'input';

  return (
    <>
      {/* 3D Avatar Voice Kiosk Modal (Identical to logged-in user experience) */}
      <AleshaKioskModal
        isOpen={isKioskOpen}
        onClose={() => setIsKioskOpen(false)}
        kioskUrl={(import.meta as any).env?.VITE_ALESHA_KIOSK_URL || 'http://localhost:3000/kiosk-public'}
        activeMenu={isPortal ? 'Portal Materi Publik' : 'Halaman Pengenalan SINAU'}
        currentUser={
          user || {
            full_name: 'Pengunjung SINAU',
            role: 'user_umum',
            unit: isPortal ? 'Portal Publik SINAU' : 'Landing Page SINAU',
          }
        }
      />

      {/* Floating Trigger Button in bottom-right corner */}
      <div className="group fixed bottom-6 right-6 z-40 flex items-center print:hidden">
        {/* Tooltip hovering on trigger button */}
        <div className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 translate-x-2 whitespace-nowrap rounded-2xl bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 text-xs text-white opacity-0 shadow-2xl transition-all group-hover:translate-x-0 group-hover:opacity-100 border border-brand-500/40 dark:bg-surface-3 dark:text-ink">
          <p className="font-bold flex items-center gap-1.5 text-white">
            <span>{ALESHA_NAME} AI</span>
            <span className="rounded-md bg-brand-500/30 border border-brand-400/30 px-1.5 py-0.5 text-[9px] font-semibold text-brand-300">
              {isPortal ? 'Portal Materi' : 'Fitur SINAU'}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-slate-300">
            {isLimitReached
              ? 'Batas 5 interaksi umum tercapai'
              : `Kuota umum: ${PUBLIC_PROMPT_LIMIT - promptCount}/${PUBLIC_PROMPT_LIMIT} interaksi tersisa`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Tutup Alesha' : 'Buka Alesha'}
          aria-expanded={open}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-brand-800 via-brand-700 to-accent-600 shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer border border-brand-300/40 text-white"
        >
          {!open && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>
          )}
          {open ? (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white">
              <X className="h-6 w-6" />
            </span>
          ) : (
            <Face className="h-14 w-14" />
          )}
        </button>
      </div>

      {/* Floating Dialog Panel matching /welcome and /portal design aesthetics */}
      <AnimatePresence>
        {open && (
          <motion.section
            key="alesha-widget"
            role="dialog"
            aria-label={ALESHA_NAME}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className={cx(
              'fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface shadow-2xl transition-all duration-300 sm:inset-auto sm:right-6 sm:rounded-3xl sm:border sm:border-line print:hidden',
              isExpanded
                ? 'sm:bottom-8 sm:h-[820px] sm:max-h-[calc(100vh-3rem)] sm:w-[720px] md:w-[820px]'
                : 'sm:bottom-20 sm:h-[680px] sm:max-h-[calc(100vh-5rem)] sm:w-[480px] md:w-[530px]'
            )}
          >
            {/* Header: Brand Gradient matching /welcome CTA & Hero */}
            <header className="flex items-center gap-3 bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 px-4 py-3.5 text-white">
              <Face className="h-10 w-10 shrink-0 ring-2 ring-white/60" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold leading-tight">{ALESHA_NAME}</p>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-xs">
                    Pengunjung Umum
                  </span>
                </div>
                <p className="text-[11px] text-white/85 truncate mt-0.5">
                  {isPortal ? 'Pemandu Portal Materi Publik' : 'Panduan Fitur & Layanan SINAU'}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={reset}
                  title="Percakapan baru"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded((e) => !e)}
                  title={isExpanded ? 'Perkecil modal' : 'Perbesar modal'}
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Tutup"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Mode Switcher: Chat AI vs 3D Avatar Kiosk */}
            <div className="grid grid-cols-2 gap-1.5 border-b border-line bg-surface-2 p-1.5">
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={cx(
                  'flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                  mode === 'chat'
                    ? 'bg-surface text-brand-700 shadow-xs border border-line'
                    : 'text-ink-3 hover:text-ink'
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>AI Chatbot</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsKioskOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400 hover:bg-surface transition-all cursor-pointer border border-transparent hover:border-line"
                title="Buka Kiosk Suara Avatar 3D interaktif"
              >
                <Sparkles className="h-3.5 w-3.5 text-accent-500" />
                <span>Avatar 3D Suara</span>
              </button>
            </div>

            {/* Sub-header Context Banner with Public Quota Tracker */}
            <div className="flex items-center justify-between border-b border-line bg-brand-50/60 dark:bg-brand-950/20 px-3.5 py-1.5 text-[11px] text-brand-800 dark:text-brand-300">
              <span className="flex items-center gap-1.5 font-medium truncate">
                {isPortal ? (
                  <>
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    <span>Mode Portal Materi</span>
                  </>
                ) : (
                  <>
                    <HelpCircle className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    <span>Mode Pengenalan Fitur</span>
                  </>
                )}
              </span>

              {/* Public Prompt Quota Indicator */}
              <span
                className={cx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1',
                  isLimitReached
                    ? 'bg-red-500/15 text-red-700 border border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                    : 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                )}
              >
                {isLimitReached ? (
                  <>
                    <Lock className="w-2.5 h-2.5" />
                    <span>Kuota Habis (5/5)</span>
                  </>
                ) : (
                  <span>Sisa Kuota: {PUBLIC_PROMPT_LIMIT - promptCount}/5</span>
                )}
              </span>
            </div>

            {/* Message Stream */}
            <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
              {messages.map((m, idx) => {
                const isLast = idx === messages.length - 1;
                return (
                  <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cx(m.role === 'assistant' ? 'max-w-[94%] flex items-start gap-2.5' : 'max-w-[88%]')}>
                      {m.role === 'assistant' && <Face className="mt-0.5 h-7 w-7 shrink-0" />}
                      <div>
                        <div
                          className={cx(
                            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs',
                            m.role === 'user'
                              ? 'rounded-br-md bg-brand-700 text-white'
                              : 'rounded-bl-md bg-surface-2 text-ink border border-line/60'
                          )}
                        >
                          <RichText text={m.content} onAction={(prompt) => { if (!thinking && !isLimitReached) { void send(prompt); } }} />
                        </div>

                        {/* Interactive Link Chip to /portal if assistant recommended it while on /welcome */}
                        {m.showPortalLink && (
                          <div className="mt-2">
                            <Link
                              to="/portal"
                              onClick={() => setOpen(false)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 hover:border-brand-400 transition-all shadow-xs dark:bg-brand-950/40 dark:border-brand-700 dark:text-brand-300"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>Buka Portal Materi Publik</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        )}

                        {/* Action Callout Button to Login when limit of 5 prompts is reached */}
                        {m.showLoginLink && (
                          <div className="mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-brand-900 to-indigo-900 text-white shadow-md border border-brand-400/40 space-y-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-brand-300" />
                              <span className="text-xs font-bold">Lanjutkan Akses Tanpa Batas</span>
                            </div>
                            <p className="text-[11px] text-white/80 leading-normal">
                              Masuk ke akun SINAU Anda untuk mendapatkan respon analisis lengkap, konsultasi materi, dan interaksi tanpa batas.
                            </p>
                            <Link
                              to="/login"
                              onClick={() => setOpen(false)}
                              className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-white text-brand-800 font-bold text-xs hover:bg-brand-50 transition shadow-xs"
                            >
                              <span>Masuk ke Akun SINAU</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        )}

                        {/* Suggestion Chips (only when quota not exhausted) */}
                        {m.role === 'assistant' && isLast && !thinking && !isLimitReached && m.suggestions?.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {m.suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => void send(s)}
                                className="rounded-full border border-brand-200 bg-surface px-3 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 hover:border-brand-400 transition-all dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/40 shadow-xs cursor-pointer"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Thinking animated bouncing dots */}
              {thinking && (
                <div className="flex items-end gap-2">
                  <Face className="h-7 w-7" />
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-2 border border-line/60 px-4 py-3 shadow-xs">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-600"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input Bar or Locked State when 5-prompt limit reached */}
            {isLimitReached ? (
              <div className="border-t border-line bg-surface p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Batas Kuota Pengunjung Tercapai (5/5)</span>
                    </p>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                      Silakan masuk untuk melanjutkan interaksi tanpa batas.
                    </p>
                  </div>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="px-3 py-1.5 rounded-xl bg-brand-700 hover:bg-brand-600 text-white font-bold text-xs shrink-0 shadow-xs transition flex items-center gap-1"
                  >
                    <span>Masuk</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <input
                  disabled
                  value=""
                  placeholder="Batas 5 interaksi pengunjung tercapai. Silakan masuk..."
                  className="input h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-xs text-ink-3 cursor-not-allowed opacity-60"
                />
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                className="flex items-center gap-2 border-t border-line bg-surface p-3"
              >
                {hasBrowserSpeech() && (
                  <button
                    type="button"
                    onClick={() => startListening('input')}
                    title={listeningInput ? 'Berhenti mendengarkan' : 'Bicara untuk mengetik (Web Speech)'}
                    className={cx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer',
                      listeningInput
                        ? 'border-red-300 bg-red-50 text-red-600 dark:bg-red-950/30'
                        : 'border-line text-ink-3 hover:bg-surface-2 hover:text-ink'
                    )}
                  >
                    {listeningInput ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}

                <input
                  ref={inputRef}
                  value={listeningInput ? transcript || input : input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    listeningInput
                      ? 'Mendengarkan ucapan Anda…'
                      : isPortal
                      ? 'Tanyakan materi di portal…'
                      : 'Tanyakan fitur & layanan SINAU…'
                  }
                  className="input h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || thinking}
                  aria-label="Kirim pertanyaan"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40 transition cursor-pointer shadow-xs"
                >
                  {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

export default AleshaWidget;
