const secureStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: any) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
};
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getDeviceId } from '../lib/deviceFingerprint';
import {
  X,
  Sparkles,
  Download,
  FileText,
  ExternalLink,
  RotateCw,
  Maximize2,
  Minimize2,
  Bot,
  ArrowRight
} from 'lucide-react';
type AssetItem = any;
type UserProfile = any;

interface AleshaKioskModalProps {
  isOpen: boolean;
  onClose: () => void;
  kioskUrl?: string;
  activeMenu?: string;
  activeFilters?: {
    category?: string;
    status?: string;
    search?: string;
    province?: string;
  };
  selectedAsset?: AssetItem | null;
  currentUser?: UserProfile | null;
  activeChatSessionId?: string | null;
}

export const AleshaKioskModal: React.FC<AleshaKioskModalProps> = ({
  isOpen,
  onClose,
  kioskUrl = 'http://localhost:3000/kiosk-public',
  activeMenu = 'Dashboard',
  activeFilters,
  selectedAsset,
  currentUser,
  activeChatSessionId,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [latestGeneratedFile, setLatestGeneratedFile] = useState<any>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  const [publicPromptCount, setPublicPromptCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        // Clean legacy generic key
        sessionStorage.removeItem('sinau_public_prompt_count');
        const val = sessionStorage.getItem('sinau_voice_prompt_count');
        return val ? parseInt(val, 10) : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Dynamic user profile resolution: prioritize explicitly passed currentUser props
  const effectiveUser: UserProfile | null = useMemo(() => {
    if (currentUser && (currentUser.full_name || currentUser.fullName || currentUser.username)) {
      return currentUser;
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = secureStorage.getItem('sinau_user_profile') || secureStorage.getItem('korlantas_user_profile');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.full_name || parsed.fullName || parsed.username)) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[AleshaKioskModal] Failed to read user_profile from localStorage', e);
      }
    }
    return null;
  }, [currentUser]);

  // Map view IDs to readable Indonesian menu names
  const readableMenuName = useMemo(() => {
    const map: Record<string, string> = {
      dashboard: 'Dashboard Utama & Statistik Logistik',
      logistics: 'Data Logistik & Manajemen Aset',
      assets: 'Data Logistik & Manajemen Aset',
      master_asset: 'Master Kategori, Merek & Spesifikasi Aset',
      'master-asset': 'Master Kategori, Merek & Spesifikasi Aset',
      master_region: 'Master Hierarki Wilayah (Polda, Polres, Polsek)',
      'master-region': 'Master Hierarki Wilayah (Polda, Polres, Polsek)',
      profile: 'User Profile & Personel Logistik',
      map: 'Peta Sebaran BMN & GIS Indonesia',
      geo: 'Peta Sebaran BMN & GIS Indonesia',
      'geo-distribution': 'Peta Sebaran Wilayah & GIS',
      reporting: 'Laporan Eksekutif & Analitik Logistik',
      reports: 'Laporan Eksekutif & Analitik BMN',
      export: 'Pusat Ekspor & Cetak Dokumen Resmi Satker',
      setting: 'Pengaturan Sistem & Konfigurasi Server',
      ai_chat: 'Alesha AI Chatbot & Asisten Cerdas Logistik',
    };
    return map[activeMenu] || activeMenu;
  }, [activeMenu]);

  // Construct target URL with rich query parameters for context injection
  const finalKioskUrl = useMemo(() => {
    try {
      const url = new URL(kioskUrl, window.location.origin);
      url.searchParams.set('context_app', 'SM-SINAU');
      url.searchParams.set('category', 'sm-sinau');
      url.searchParams.set('mode', 'voice');
      if (deviceId) {
        url.searchParams.set('device_id', deviceId);
      }
      url.searchParams.set('menu', readableMenuName);

      if (effectiveUser) {
        const name = effectiveUser.full_name || effectiveUser.fullName || effectiveUser.username || 'Personel';
        const role = effectiveUser.role || 'GURU';
        const unit = effectiveUser.unit || 'Sinau Smart School';
        let targetRoleCode = (role || '').toLowerCase().trim();
        if (targetRoleCode.includes('super') || targetRoleCode.includes('sekolah') || targetRoleCode === 'admin') targetRoleCode = 'admin_sekolah';
        else if (targetRoleCode.includes('kepsek') || targetRoleCode.includes('kepala') || targetRoleCode.includes('wake')) targetRoleCode = 'kepsek';
        else if (targetRoleCode.includes('prodi') || targetRoleCode.includes('jurusan')) targetRoleCode = 'kaprodi';
        else if (targetRoleCode.includes('guru') || targetRoleCode.includes('teacher')) targetRoleCode = 'guru';
        else if (targetRoleCode.includes('bk') || targetRoleCode.includes('konseling')) targetRoleCode = 'bk';
        else if (targetRoleCode.includes('keuangan') || targetRoleCode.includes('bendahara')) targetRoleCode = 'keuangan';
        else if (targetRoleCode.includes('wali') || targetRoleCode.includes('orang_tua') || targetRoleCode.includes('parent')) targetRoleCode = 'wali_murid';
        else if (targetRoleCode.includes('industri') || targetRoleCode.includes('du_di')) targetRoleCode = 'pembimbing_industri';
        else if (targetRoleCode.includes('siswa') || targetRoleCode.includes('student') || targetRoleCode.includes('murid')) targetRoleCode = 'siswa';
        else if (targetRoleCode.includes('umum') || targetRoleCode.includes('public') || targetRoleCode.includes('visitor')) targetRoleCode = 'user_umum';

        url.searchParams.set('role', role);
        url.searchParams.set('user_role', role);
        url.searchParams.set('target_role', targetRoleCode);
        url.searchParams.set('user_name', name);
        url.searchParams.set('user_fullname', name);
        url.searchParams.set('fullName', name);
        url.searchParams.set('unit', unit);
        url.searchParams.set('user_unit', unit);
        if (effectiveUser.rank) url.searchParams.set('rank', effectiveUser.rank);
        if (effectiveUser.nrp) url.searchParams.set('nrp', effectiveUser.nrp);
      } else {
        url.searchParams.set('role', 'user_umum');
        url.searchParams.set('user_role', 'user_umum');
        url.searchParams.set('target_role', 'user_umum');
        url.searchParams.set('prompt_limit', '5');
        url.searchParams.set('prompt_count', String(publicPromptCount));
        url.searchParams.set('user_name', 'Pengunjung SINAU');
        url.searchParams.set('user_fullname', 'Pengunjung SINAU');
        url.searchParams.set('fullName', 'Pengunjung SINAU');
        url.searchParams.set('unit', 'Portal Publik SINAU');
        url.searchParams.set('user_unit', 'Portal Publik SINAU');
      }

      // Shared Memory Session ID Bridge with Chatbot (Sinau Scope)
      const userScope = effectiveUser?.id ? `usr_${effectiveUser.id}` : (effectiveUser?.username ? `usr_${effectiveUser.username}` : 'visitor');
      const activeSessionKey = `sm_sinau_ai_active_session_id_${userScope}`;
      const storedSessionId = activeChatSessionId || (typeof window !== 'undefined' ? (localStorage.getItem(activeSessionKey) || localStorage.getItem('sm_sinau_ai_session_id')) : null);
      const fallbackSessionId = effectiveUser?.id ? `sinau_${userScope}_${effectiveUser.id}` : `sinau_${userScope}_kiosk`;
      const activeSessionId = storedSessionId || fallbackSessionId;
      url.searchParams.set('session_id', activeSessionId);
      url.searchParams.set('shared_session_id', activeSessionId);

      if (activeFilters) {
        if (activeFilters.category) url.searchParams.set('filter_category', activeFilters.category);
        if (activeFilters.status) url.searchParams.set('filter_status', activeFilters.status);
        if (activeFilters.province) url.searchParams.set('filter_province', activeFilters.province);
        if (activeFilters.search) url.searchParams.set('filter_search', activeFilters.search);
      }

      if (selectedAsset) {
        url.searchParams.set('asset_id', String(selectedAsset.id));
        url.searchParams.set('asset_code', selectedAsset.code || '');
        url.searchParams.set('asset_name', selectedAsset.name || '');
        url.searchParams.set('asset_category', selectedAsset.category || '');
      }

      return url.toString();
    } catch {
      return kioskUrl;
    }
  }, [kioskUrl, readableMenuName, effectiveUser, activeFilters, selectedAsset, activeChatSessionId, deviceId]);

  // Send real-time context message into the iframe window via postMessage
  const sendContextUpdate = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const roleStr = String(effectiveUser?.role || 'user_umum').toLowerCase();
      let targetRoleCode = 'user_umum';
      if (roleStr.includes('super') || roleStr.includes('sekolah') || roleStr === 'admin') targetRoleCode = 'admin_sekolah';
      else if (roleStr.includes('kepsek') || roleStr.includes('kepala') || roleStr.includes('wake')) targetRoleCode = 'kepsek';
      else if (roleStr.includes('prodi') || roleStr.includes('jurusan')) targetRoleCode = 'kaprodi';
      else if (roleStr.includes('guru') || roleStr.includes('teacher')) targetRoleCode = 'guru';
      else if (roleStr.includes('bk') || roleStr.includes('konseling')) targetRoleCode = 'bk';
      else if (roleStr.includes('keuangan') || roleStr.includes('bendahara')) targetRoleCode = 'keuangan';
      else if (roleStr.includes('wali') || roleStr.includes('orang_tua') || roleStr.includes('parent')) targetRoleCode = 'wali_murid';
      else if (roleStr.includes('industri') || roleStr.includes('du_di')) targetRoleCode = 'pembimbing_industri';
      else if (roleStr.includes('siswa') || roleStr.includes('student') || roleStr.includes('murid')) targetRoleCode = 'siswa';

      const payload = {
        context_app: 'SM-SINAU',
        category_id: 33,
        current_menu: readableMenuName,
        active_filter: activeFilters
          ? [
            activeFilters.category ? `Kategori: ${activeFilters.category}` : null,
            activeFilters.status ? `Status: ${activeFilters.status}` : null,
            activeFilters.province ? `Wilayah: ${activeFilters.province}` : null,
            activeFilters.search ? `Cari: ${activeFilters.search}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
          : '',
        selected_asset: selectedAsset
          ? `${selectedAsset.code} - ${selectedAsset.name} (Kondisi: ${selectedAsset.status}, Merek: ${selectedAsset.brand})`
          : '',
        user_role: effectiveUser?.role || 'GURU',
        role: effectiveUser?.role || 'GURU',
        target_role: targetRoleCode,
        user_unit: effectiveUser?.unit || 'Sinau Smart School',
        user_name: effectiveUser?.full_name || effectiveUser?.fullName || effectiveUser?.username || 'Personel',
        user_fullname: effectiveUser?.full_name || effectiveUser?.fullName || effectiveUser?.username || 'Personel',
        fullName: effectiveUser?.full_name || effectiveUser?.fullName || effectiveUser?.username || 'Personel',
        user_rank: effectiveUser?.rank || '',
        user_nrp: effectiveUser?.nrp || '',
        user_email: effectiveUser?.email || '',
        user_phone: effectiveUser?.phone || '',
      };

      iframeRef.current.contentWindow.postMessage(
        { type: 'ALESHA_CONTEXT_UPDATE', payload },
        '*'
      );
      console.log('[SM-Logistik -> Alesha Bridge] Context synchronized:', payload);
    }
  };

  // Authoritative device-level quota sync from backend for Voice Avatar Mode
  useEffect(() => {
    if (!isOpen) return;
    const syncQuota = async () => {
      try {
        const aleshaApiBase = (import.meta as any).env?.VITE_ALESHA_API_URL || 'http://localhost:8000';
        const devId = deviceId || (await getDeviceId());
        const res = await fetch(`${aleshaApiBase}/api/chat/sinau/public-quota?mode=voice&device_id=${encodeURIComponent(devId)}`, {
          headers: { 'X-Device-Id': devId },
        });
        if (res.ok) {
          const data = await res.json();
          const voiceCount = typeof data.voice_prompt_count === 'number'
            ? data.voice_prompt_count
            : (typeof data.prompt_count === 'number' ? data.prompt_count : 0);
          const limitReached = Boolean(data.voice_limit_reached ?? (data.is_limit_reached || voiceCount >= 5));
          setPublicPromptCount(voiceCount);
          setIsLimitReached(limitReached);
          try {
            sessionStorage.setItem('sinau_voice_prompt_count', String(voiceCount));
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[AleshaKioskModal] Error fetching public quota:', e);
      }
    };
    syncQuota();
  }, [isOpen, deviceId]);

  useEffect(() => {
    // Bi-directional event listeners from avatar kiosk
    const handleSessionSync = (event: MessageEvent) => {
      if (event.data && event.data.type === 'ALESHA_SESSION_SYNC' && event.data.sessionId) {
        if (typeof window !== 'undefined') {
          const userScope = effectiveUser?.id ? `usr_${effectiveUser.id}` : (effectiveUser?.username ? `usr_${effectiveUser.username}` : 'visitor');
          localStorage.setItem(`sm_sinau_ai_active_session_id_${userScope}`, event.data.sessionId);
          localStorage.setItem('sm_sinau_ai_session_id', event.data.sessionId);
        }
      } else if (event.data && event.data.type === 'ALESHA_CHAT_MESSAGE') {
        const { sessionId, userMessage, assistantMessage } = event.data;
        if (typeof window !== 'undefined' && sessionId) {
          const userScope = effectiveUser?.id ? `usr_${effectiveUser.id}` : (effectiveUser?.username ? `usr_${effectiveUser.username}` : 'visitor');
          const msgKey = `sm_sinau_ai_messages_${userScope}_${sessionId}`;
          try {
            const existing = JSON.parse(localStorage.getItem(msgKey) || '[]');
            const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            if (userMessage) {
              existing.push({
                id: `usr-${Date.now()}`,
                sessionId,
                role: 'user',
                content: userMessage,
                timestamp: now
              });
            }
            if (assistantMessage) {
              existing.push({
                id: `bot-${Date.now() + 1}`,
                sessionId,
                role: 'assistant',
                content: assistantMessage,
                timestamp: now
              });
            }
            localStorage.setItem(msgKey, JSON.stringify(existing));
            window.dispatchEvent(new CustomEvent('alesha_chat_updated', { detail: { sessionId } }));
          } catch(e) {}

          // Increment & sync voice quota for public visitor immediately
          if (typeof event.data.voice_prompt_count === 'number') {
            const vCount = event.data.voice_prompt_count;
            setPublicPromptCount(vCount);
            setIsLimitReached(vCount >= 5);
            try {
              sessionStorage.setItem('sinau_voice_prompt_count', String(vCount));
            } catch (_) {}
          } else {
            setPublicPromptCount(prev => {
              const next = Math.min(5, prev + 1);
              try { sessionStorage.setItem('sinau_voice_prompt_count', String(next)); } catch (_) {}
              if (next >= 5) setIsLimitReached(true);
              return next;
            });
          }
          if (event.data.limit_reached) {
            setIsLimitReached(true);
            setPublicPromptCount(5);
          }
        }
      }
    };
    window.addEventListener('message', handleSessionSync);

    const handleFileGenerated = (event: MessageEvent) => {
      if (event.data) {
        if (event.data.type === 'ALESHA_FILE_GENERATED' && event.data.payload) {
          setLatestGeneratedFile(event.data.payload);
        } else if (event.data.type === 'ALESHA_KIOSK_EVENT' && event.data.action === 'FILE_GENERATED' && event.data.data) {
          setLatestGeneratedFile(event.data.data);
        } else if (event.data.type === 'ALESHA_KIOSK_EVENT' && event.data.action === 'LIMIT_REACHED') {
          setIsLimitReached(true);
          setPublicPromptCount(5);
          try {
            sessionStorage.setItem('sinau_voice_prompt_count', '5');
          } catch(e) {}
        } else if (event.data.type === 'ALESHA_KIOSK_EVENT' && event.data.action === 'PROMPT_USED') {
          const c = event.data.count || 1;
          setPublicPromptCount(c);
          try {
            sessionStorage.setItem('sinau_voice_prompt_count', String(c));
          setIsLimitReached(c >= 5);
          } catch(e) {}
          if (c >= 5) {
            setIsLimitReached(true);
          }
        }
      }
    };
    window.addEventListener('message', handleFileGenerated);

    return () => {
      window.removeEventListener('message', handleSessionSync);
      window.removeEventListener('message', handleFileGenerated);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      try {
        sessionStorage.removeItem('sinau_public_prompt_count');
      } catch (_) {}
      const saved = sessionStorage.getItem('sinau_voice_prompt_count');
      const count = saved ? parseInt(saved, 10) : 0;
      setPublicPromptCount(count);
      setIsLimitReached(count >= 5 && (!currentUser || currentUser.role === 'user_umum'));
      setIsLoading(true);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose, currentUser]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        sendContextUpdate();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, finalKioskUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className={`bg-slate-950 border border-indigo-500/30 rounded-3xl flex flex-col shadow-2xl overflow-hidden text-white transition-all duration-300 my-auto ${isFullscreen
          ? 'w-[98vw] h-[96vh]'
          : 'w-full max-w-5xl h-[84vh] max-h-[760px]'
          }`}
      >
        {/* Clean Minimalist Header (matching SM-Sinau) */}
        <div className="px-5 py-3 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-sm sm:text-base font-bold tracking-tight text-white">
              Alesha AI
            </span>
          </div>

          {/* Sisa Kuota Suara Avatar (Visual Quota Badge for Public Visitors) */}
          {(!currentUser || currentUser.role === 'user_umum') && (
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl border text-xs shadow-xs transition-all ${
                isLimitReached
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-200'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isLimitReached ? 'text-rose-400' : 'text-amber-400'}`} />
              <span className="text-slate-400 font-medium hidden sm:inline">Sisa Kuota Suara:</span>
              <span className="text-slate-400 font-medium sm:hidden">Suara:</span>
              <span className={`font-bold ${isLimitReached ? 'text-rose-400' : 'text-amber-300'}`}>
                {Math.max(0, 5 - publicPromptCount)}/5
              </span>
              {isLimitReached ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold uppercase">
                  Habis
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium hidden md:inline">
                  Tersisa
                </span>
              )}
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Direct File Download Badge from Avatar */}
            {latestGeneratedFile && (() => {
              const fUrl = String(latestGeneratedFile.download_url || latestGeneratedFile.url || latestGeneratedFile.file_url || '');
              const fName = String(latestGeneratedFile.filename || latestGeneratedFile.title || 'dokumen');
              const fType = String(latestGeneratedFile.type || latestGeneratedFile.format || '').toLowerCase();
              const combined = `${fUrl} ${fName} ${fType}`.toLowerCase();

              let style = {
                bg: 'bg-red-600/25 hover:bg-red-600/40 border-red-500/50 text-red-200',
                iconText: 'text-red-400',
                label: 'PDF',
              };

              if (combined.includes('docx') || combined.includes('doc') || combined.includes('word')) {
                style = {
                  bg: 'bg-blue-600/25 hover:bg-blue-600/40 border-blue-500/50 text-blue-200',
                  iconText: 'text-blue-400',
                  label: 'Word',
                };
              } else if (combined.includes('xlsx') || combined.includes('xls') || combined.includes('excel') || combined.includes('spreadsheet')) {
                style = {
                  bg: 'bg-emerald-600/25 hover:bg-emerald-600/40 border-emerald-500/50 text-emerald-200',
                  iconText: 'text-emerald-400',
                  label: 'Excel',
                };
              } else if (combined.includes('csv')) {
                style = {
                  bg: 'bg-teal-600/25 hover:bg-teal-600/40 border-teal-500/50 text-teal-200',
                  iconText: 'text-teal-400',
                  label: 'CSV',
                };
              }

              let resolvedUrl = fUrl.startsWith('/static/')
                ? `http://localhost:8000${fUrl}`
                : fUrl;
              resolvedUrl = resolvedUrl.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1):8000/i, 'http://localhost:8000');
              resolvedUrl = resolvedUrl.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, 'http://localhost:3000');

              return (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={latestGeneratedFile.filename || `dokumen.${style.label.toLowerCase()}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${style.bg} border hover:text-white text-xs font-semibold shadow-xs transition-all animate-in fade-in`}
                  title={`Unduh ${latestGeneratedFile.title || 'Dokumen'}`}
                >
                  <Download className={`w-3.5 h-3.5 ${style.iconText}`} />
                  <span className="hidden sm:inline">Unduh {latestGeneratedFile.type || style.label}</span>
                </a>
              );
            })()}

            <button
              onClick={() => {
                setIsLoading(true);
                setIframeKey((prev) => prev + 1);
              }}
              title="Muat Ulang Avatar Kiosk"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer border border-slate-800"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer border border-slate-800"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              title="Tutup Asisten"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer border border-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Kiosk Avatar Frame Area */}
        <div className="relative flex-1 w-full bg-slate-950 overflow-hidden">
          {/* Public Limit Reached Banner */}
          {isLimitReached && (!currentUser || currentUser.role === 'user_umum') && (
            <div className="absolute top-4 inset-x-4 z-30 mx-auto max-w-xl bg-slate-950/95 border border-amber-500/50 rounded-2xl p-3.5 text-white shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                    <span>Batas 5 Interaksi Avatar Suara Tercapai</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/30">Pengunjung Umum</span>
                  </p>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">
                    Masuk ke akun SINAU untuk berinteraksi lebih lanjut tanpa batasan.
                  </p>
                </div>
              </div>
              <a
                href="/login"
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-700 to-indigo-600 hover:from-brand-600 hover:to-indigo-500 text-white font-bold text-xs shrink-0 shadow-md transition flex items-center gap-1"
              >
                <span>Masuk Akun</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white">
                  <Bot className="w-5 h-5 animate-pulse" />
                </div>
              </div>
              <p className="text-sm text-slate-300 font-medium">Menghubungkan ke Alesha AI Assistant...</p>
              <p className="text-xs text-slate-500">Menyinkronkan data logistik Sinau Smart School</p>
            </div>
          )}

          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={finalKioskUrl}
            title="Alesha AI Virtual Assistant Kiosk"
            className="w-full h-full border-0"
            allow="microphone; camera; display-capture; autoplay; clipboard-write;"
            onLoad={() => {
              setIsLoading(false);
              sendContextUpdate();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AleshaKioskModal;
