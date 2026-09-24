import React, { useState, useEffect } from 'react';
import { Bot, MessageSquare, Mic, Sparkles, X, ChevronRight } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { AiChatSinauModal } from './AiChatSinauModule';
import { AleshaKioskModal } from './AleshaKioskModal';

export function AleshaFloatingAssistant() {
  const { user, activeRole } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Listen for global custom events or URL params
  useEffect(() => {
    const handleOpenChat = () => setIsChatOpen(true);
    const handleOpenKiosk = () => setIsKioskOpen(true);

    window.addEventListener('open-alesha-chat', handleOpenChat);
    window.addEventListener('open-alesha-kiosk', handleOpenKiosk);

    // Check URL parameters
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'ai_chat' || params.get('alesha') === 'chat') {
      setIsChatOpen(true);
    } else if (params.get('view') === 'ai_kiosk' || params.get('alesha') === 'kiosk') {
      setIsKioskOpen(true);
    }

    return () => {
      window.removeEventListener('open-alesha-chat', handleOpenChat);
      window.removeEventListener('open-alesha-kiosk', handleOpenKiosk);
    };
  }, []);

  return (
    <>
      {/* Full Feature AI Chatbot Modal */}
      <AiChatSinauModal
        key={user?.id || 'anonymous'}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentUser={user}
        activeRole={activeRole || undefined}
        activeMenu="Sinau E-Learning & SIS"
      />

      {/* Alesha 3D Avatar Voice Kiosk Modal */}
      <AleshaKioskModal
        isOpen={isKioskOpen}
        onClose={() => setIsKioskOpen(false)}
        kioskUrl={(import.meta as any).env?.VITE_ALESHA_KIOSK_URL || "http://localhost:3000/kiosk-public"}
        activeMenu="Sinau E-Learning & SIS"
        currentUser={user}
        activeChatSessionId={typeof window !== 'undefined' ? (localStorage.getItem(`sm_sinau_ai_active_session_id_${user?.id ? `usr_${user.id}` : (user?.username ? `usr_${user.username}` : 'guest')}`) || localStorage.getItem('sm_sinau_ai_session_id')) : undefined}
      />

      {/* Floating Trigger Container */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end group">
        {/* Quick Selection Popover Menu */}
        {isMenuOpen && (
          <div className="mb-3 w-64 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2.5 shadow-2xl border border-brand-500/40 text-white animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800/80 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-xs font-bold tracking-tight">Alesha AI Assistant</span>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsChatOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-brand-600/30 border border-transparent hover:border-brand-500/30 transition text-left cursor-pointer group/btn"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center group-hover/btn:bg-brand-600 group-hover/btn:text-white transition">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover/btn:text-white">AI Chatbot Cerdas</div>
                    <div className="text-[10px] text-slate-400">Teks, tabel, & visualisasi grafik</div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-brand-300" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsKioskOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-violet-600/30 border border-transparent hover:border-violet-500/30 transition text-left cursor-pointer group/btn"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center group-hover/btn:bg-violet-500 group-hover/btn:text-white transition">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 group-hover/btn:text-white">Kiosk Suara Avatar</div>
                    <div className="text-[10px] text-slate-400">Asisten suara 3D interaktif</div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/btn:text-violet-300" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center">
          {/* Hover Tooltip to the left */}
          {!isMenuOpen && (
            <div className="absolute right-full mr-3.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out z-50">
              <div className="relative flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-900/95 backdrop-blur-md text-white text-xs rounded-2xl shadow-2xl border border-brand-500/40 whitespace-nowrap">
                <div>
                  <p className="font-extrabold text-white flex items-center gap-1.5 leading-none">
                    <span>Alesha AI Assistant</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-brand-500/30 text-brand-300 rounded font-semibold border border-brand-400/30">
                      SM-Sinau
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Klik untuk membuka AI Chatbot atau Avatar Voice
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Circular Trigger Button */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="relative w-14 h-14 rounded-full bg-gradient-to-tr from-teal-600 via-brand-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white flex items-center justify-center shadow-2xl hover:shadow-brand-500/40 border border-brand-300/40 transition-all duration-300 transform hover:scale-110 active:scale-95 cursor-pointer group-hover:ring-4 group-hover:ring-brand-500/25"
            aria-label="Buka Alesha AI Assistant"
            title="Alesha AI Assistant (Chatbot & Voice Kiosk)"
          >
            {/* Glowing Ping Indicator */}
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900"></span>
            </span>
            <Bot className="w-6 h-6 text-white group-hover:rotate-12 transition-transform duration-300" />
          </button>
        </div>
      </div>
    </>
  );
}
