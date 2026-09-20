import { create } from 'zustand';

export interface Toast { id: number; kind: 'success' | 'error' | 'info' | 'warning'; title: string; body?: string }
interface UiState {
  sidebarOpen: boolean; // mobile drawer
  sidebarCollapsed: boolean; // desktop mini mode
  toasts: Toast[];
  setSidebarOpen: (v: boolean) => void;
  toggleCollapsed: () => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}
let seq = 1;
export const useUi = create<UiState>((set) => ({
  sidebarOpen: false,
  sidebarCollapsed: (() => { try { return localStorage.getItem('sinau.sidebar') === '1'; } catch { return false; } })(),
  toasts: [],
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleCollapsed: () => set((s) => { const v = !s.sidebarCollapsed; try { localStorage.setItem('sinau.sidebar', v ? '1' : '0'); } catch { /* noop */ } return { sidebarCollapsed: v }; }),
  toast: (t) => { const id = seq++; set((s) => ({ toasts: [...s.toasts, { ...t, id }] })); setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 7000 : 4000); },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
export const toast = {
  success: (title: string, body?: string) => useUi.getState().toast({ kind: 'success', title, body }),
  error: (title: string, body?: string) => useUi.getState().toast({ kind: 'error', title, body }),
  info: (title: string, body?: string) => useUi.getState().toast({ kind: 'info', title, body }),
  warning: (title: string, body?: string) => useUi.getState().toast({ kind: 'warning', title, body }),
};
