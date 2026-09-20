import { create } from 'zustand';
import { api, tokens, toApiError } from '@/lib/api';
import { Me, Role, ROLE_PREFIX } from '@/lib/types';
import { applyBrand, applyTheme } from '@/lib/brand';

interface AuthState {
  user: Me | null;
  activeRole: Role | null;
  loading: boolean;
  ready: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  setActiveRole: (r: Role) => void;
  switchTenant: (tenantId: string | null) => Promise<void>;
  has: (perm: string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
  feature: (key: string, fallback?: boolean) => boolean;
}

const pickRole = (me: Me): Role => {
  const saved = tokens.role as Role | null;
  if (saved && me.roles.includes(saved)) return saved;
  const order: Role[] = ['SUPER_ADMIN', 'ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'KAPRODI', 'KEUANGAN', 'BK', 'GURU', 'STAF', 'AUDITOR', 'WALI_MURID', 'SISWA', 'PEMBIMBING_INDUSTRI', 'PENGUJI_EKSTERNAL', 'CALON_SISWA'];
  return order.find((r) => me.roles.includes(r)) ?? me.roles[0];
};

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  activeRole: null,
  loading: false,
  ready: false,

  async login(username, password) {
    set({ loading: true });
    try {
      const res = await api.post('/auth/login', { username, password });
      const d = res.data.data as { accessToken: string; refreshToken: string; user: Me };
      tokens.set(d.accessToken, d.refreshToken);
      tokens.setTenant(null);
      const role = pickRole(d.user);
      tokens.setRole(role);
      applyBrand(d.user.tenant?.primary_color, d.user.tenant?.accent_color);
      applyTheme(d.user.theme);
      set({ user: d.user, activeRole: role, loading: false, ready: true });
      return d.user;
    } catch (e) {
      set({ loading: false });
      throw toApiError(e);
    }
  },

  async logout() {
    const rt = tokens.refresh;
    try { if (rt) await api.post('/auth/logout', { refreshToken: rt }); } catch { /* ignore */ }
    tokens.clear();
    set({ user: null, activeRole: null, ready: true });
  },

  async refreshMe() {
    if (!tokens.access && !tokens.refresh) { set({ ready: true, user: null }); return null; }
    try {
      const me = (await api.get('/auth/me')).data.data as Me;
      const role = get().activeRole && me.roles.includes(get().activeRole!) ? get().activeRole! : pickRole(me);
      applyBrand(me.tenant?.primary_color, me.tenant?.accent_color);
      applyTheme(me.theme);
      set({ user: me, activeRole: role, ready: true });
      return me;
    } catch {
      tokens.clear();
      set({ user: null, activeRole: null, ready: true });
      return null;
    }
  },

  setActiveRole(r) { tokens.setRole(r); set({ activeRole: r }); },

  async switchTenant(tenantId) {
    tokens.setTenant(tenantId);
    await get().refreshMe();
  },

  has(perm) { const u = get().user; return !!u && (u.is_super_admin || u.permissions.includes(perm)); },
  hasRole(...roles) { const u = get().user; return !!u && roles.some((r) => u.roles.includes(r)); },
  feature(key, fallback = true) { const u = get().user; const v = u?.features?.[key]; return v === undefined ? fallback : v; },
}));

export const rolePrefix = (r: Role | null) => (r ? ROLE_PREFIX[r] : 'siswa');
export const homeOf = (r: Role | null) => `/${rolePrefix(r)}/dashboard`;

window.addEventListener('sinau:logout', () => { tokens.clear(); useAuth.setState({ user: null, activeRole: null, ready: true }); });
