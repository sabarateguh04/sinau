import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AleshaWidget } from '@/components/AleshaWidget';
import { Menu, X, Bell, ChevronsLeft, ChevronsRight, LogOut, Moon, Sun, Monitor, Building2, ChevronDown, UserCircle2, Search, Wifi, WifiOff } from 'lucide-react';
import { useAuth, rolePrefix, homeOf } from '@/store/auth';
import { useUi, toast } from '@/store/ui';
import { NAV, NavItem } from '@/lib/nav';
import { ROLE_LABELS, Role, Notification } from '@/lib/types';
import { Avatar, Dropdown, MenuItem, cx, Kbd } from '@/components/ui';
import { api, API_BASE, tokens, get } from '@/lib/api';
import { applyTheme } from '@/lib/brand';
import { fmtAgo } from '@/lib/format';
import { hasPage } from '@/pages/registry';

export default function AppShell() {
  const { user, activeRole, has, feature, logout, setActiveRole, switchTenant } = useAuth();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleCollapsed } = useUi();
  const loc = useLocation();
  const nav = useNavigate();
  const prefix = rolePrefix(activeRole);
  useEffect(() => { setSidebarOpen(false); }, [loc.pathname, setSidebarOpen]);

  const sections = useMemo(() => {
    if (!user || !activeRole) return [];
    const allowed = (it: NavItem) => {
      if (!hasPage(it.to)) return false;
      if (it.feature && !feature(it.feature, true)) return false;
      if (!it.perm) return true;
      return (Array.isArray(it.perm) ? it.perm : [it.perm]).some((p) => has(p));
    };
    return NAV[activeRole].map((s) => ({ ...s, items: s.items.filter(allowed) })).filter((s) => s.items.length);
  }, [user, activeRole, has, feature]);

  if (!user) return null;
  const tenantName = user.tenant?.display_name || user.tenant?.name || 'SINAU';

  const Sidebar = ({ mini }: { mini: boolean }) => (
    <div className="flex h-full flex-col">
      <div className={cx('flex items-center gap-3 px-4', mini ? 'h-16 justify-center' : 'h-16')}>
        {user.tenant?.logo_url ? <img src={user.tenant.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 font-black text-white">S</div>}
        {!mini && <div className="min-w-0"><div className="truncate text-sm font-bold leading-tight">{tenantName}</div><div className="truncate text-[11px] text-ink-3">{ROLE_LABELS[activeRole!]}</div></div>}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && !mini && <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-3">{s.title}</div>}
            <ul className="space-y-0.5">
              {s.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={`/${prefix}/${it.to}`} title={mini ? it.label : undefined} className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', mini && 'justify-center px-0', isActive ? 'bg-brand-700 text-white shadow-sm shadow-brand-700/30' : 'text-ink-2 hover:bg-surface-3 hover:text-ink')}>
                    <it.icon className="h-[18px] w-[18px] shrink-0" />
                    {!mini && <span className="truncate">{it.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {!mini && (
        <div className="border-t border-line p-3 text-[11px] text-ink-3">SINAU · v0.1</div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cx('sticky top-0 hidden h-screen shrink-0 border-r border-line bg-surface transition-[width] lg:block', sidebarCollapsed ? 'w-[76px]' : 'w-64')}>
        <Sidebar mini={sidebarCollapsed} />
        <button onClick={toggleCollapsed} className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow hover:text-ink">{sidebarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}</button>
      </aside>
      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)}>
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 400, damping: 36 }} className="h-full w-72 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <Sidebar mini={false} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {user.must_change_password && !loc.pathname.endsWith('/profil') && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
              <span>Anda masih memakai kata sandi sementara. Segera ganti kata sandi.</span>
              <button onClick={() => nav(`/${prefix}/profil?tab=sandi`)} className="font-semibold underline">Ganti sekarang</button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <AleshaWidget />
    </div>
  );

  function Topbar({ onMenu }: { onMenu: () => void }) {
    return (
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
        <button onClick={onMenu} className="rounded-lg p-2 text-ink-2 hover:bg-surface-3 lg:hidden"><Menu className="h-5 w-5" /></button>
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-ink-2 md:flex">
          <Search className="h-4 w-4 text-ink-3" />
          <span className="truncate">{tenantName}</span>
          <Kbd>{ROLE_LABELS[activeRole!]}</Kbd>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5">
          {user!.is_super_admin && <TenantSwitcher onSwitch={switchTenant} current={tokens.tenant} label={user!.tenant?.name ?? 'Platform'} />}
          {user!.roles.length > 1 && (
            <Dropdown trigger={<button className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-3"><UserCircle2 className="h-4 w-4" /><span className="hidden sm:inline">{ROLE_LABELS[activeRole!]}</span><ChevronDown className="h-3.5 w-3.5" /></button>}>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-ink-3">Ganti peran</div>
              {user!.roles.map((r) => <MenuItem key={r} onClick={() => { setActiveRole(r as Role); nav(homeOf(r as Role)); }}>{ROLE_LABELS[r as Role]}{r === activeRole && ' ✓'}</MenuItem>)}
            </Dropdown>
          )}
          <ThemeToggle />
          <NotificationBell />
          <Dropdown trigger={<button className="ml-1 flex items-center gap-2 rounded-xl p-1 hover:bg-surface-3"><Avatar src={user!.avatar_url} name={user!.full_name} size="sm" /><span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{user!.full_name}</span></button>}>
            <div className="px-3 py-2"><div className="truncate text-sm font-semibold">{user!.full_name}</div><div className="truncate text-xs text-ink-3">@{user!.username}</div></div>
            <MenuItem icon={<UserCircle2 className="h-4 w-4" />} onClick={() => nav(`/${prefix}/profil`)}>Profil & keamanan</MenuItem>
            <MenuItem icon={<LogOut className="h-4 w-4" />} danger onClick={async () => { await logout(); nav('/login'); }}>Keluar</MenuItem>
          </Dropdown>
        </div>
      </header>
    );
  }
}

function ThemeToggle() {
  const { user } = useAuth();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(user?.theme ?? 'system');
  const next = () => { const order: ('system' | 'light' | 'dark')[] = ['light', 'dark', 'system']; const t = order[(order.indexOf(theme) + 1) % 3]; setTheme(t); applyTheme(t); api.put('/auth/me', { theme: t }).catch(() => undefined); };
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return <button onClick={next} title={`Tema: ${theme}`} className="rounded-xl p-2 text-ink-2 hover:bg-surface-3"><Icon className="h-[18px] w-[18px]" /></button>;
}

function TenantSwitcher({ onSwitch, current, label }: { onSwitch: (id: string | null) => Promise<void>; current: string | null; label: string }) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { api.get('/tenants', { params: { limit: 100 } }).then((r) => setList(r.data.data)).catch(() => undefined); }, []);
  return (
    <Dropdown trigger={<button className="flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-100"><Building2 className="h-4 w-4" /><span className="hidden max-w-40 truncate sm:inline">{current ? label : 'Platform'}</span><ChevronDown className="h-3.5 w-3.5" /></button>}>
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-ink-3">Masuk sebagai lembaga</div>
      <MenuItem onClick={() => onSwitch(null)}>Platform (tanpa lembaga){!current && ' ✓'}</MenuItem>
      <div className="max-h-64 overflow-y-auto">{list.map((t) => <MenuItem key={t.id} onClick={() => onSwitch(t.id)}>{t.name}{current === t.id && ' ✓'}</MenuItem>)}</div>
    </Dropdown>
  );
}

function NotificationBell() {
  const { user, activeRole } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(user?.unread_notifications ?? 0);
  const [online, setOnline] = useState(true);
  const esRef = useRef<EventSource | null>(null);
  const load = () => get<Notification[]>('/notifications', { limit: 8 }).then((d) => setItems(d)).catch(() => undefined);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = tokens.access;
    if (!t || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(t)}`);
    esRef.current = es;
    es.addEventListener('notification', (e) => { const d = JSON.parse((e as MessageEvent).data); setUnread((u) => u + 1); toast.info(d.title, d.body); load(); });
    es.addEventListener('exam:force-submit', () => window.dispatchEvent(new CustomEvent('sinau:exam-force-submit')));
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    return () => es.close();
  }, []);
  const open = async (n: Notification) => {
    if (!n.read_at) { await api.post('/notifications/read', { ids: [n.id] }).catch(() => undefined); setUnread((u) => Math.max(0, u - 1)); load(); }
    if (n.link) nav(rewriteLink(n.link, activeRole));
  };
  return (
    <Dropdown trigger={<button className="relative rounded-xl p-2 text-ink-2 hover:bg-surface-3"><Bell className="h-[18px] w-[18px]" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}</button>}>
      <div className="flex w-80 items-center justify-between px-3 py-2"><span className="text-sm font-semibold">Notifikasi</span><span className="flex items-center gap-1 text-[10px] text-ink-3">{online ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3" />}{online ? 'realtime' : 'offline'}</span></div>
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-ink-3">Belum ada notifikasi</div>}
        {items.map((n) => (
          <button key={n.id} onClick={() => open(n)} className={cx('flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-3', !n.read_at && 'bg-brand-50/60 dark:bg-brand-900/20')}>
            <span className="line-clamp-1 text-sm font-medium">{n.title}</span>
            {n.body && <span className="line-clamp-2 text-xs text-ink-2">{n.body}</span>}
            <span className="text-[10px] text-ink-3">{fmtAgo(n.created_at)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <button className="text-xs text-ink-2 hover:text-ink" onClick={async () => { await api.post('/notifications/read', { all: true }); setUnread(0); load(); }}>Tandai semua dibaca</button>
        <button className="text-xs font-semibold text-brand-700" onClick={() => nav(`/${rolePrefix(activeRole)}/notifikasi`)}>Lihat semua</button>
      </div>
    </Dropdown>
  );
}

/** Backend links are written for a canonical prefix (/siswa/..., /guru/...). Re-map to the active role prefix when the page exists there. */
export function rewriteLink(link: string, role: Role | null) {
  const m = /^\/(siswa|guru|ortu|admin|superadmin|kepsek|keuangan|bk|wakepsek|kaprodi)\/(.*)$/.exec(link);
  if (!m) return link.startsWith('/') ? `/${rolePrefix(role)}${link}` : link;
  return `/${rolePrefix(role)}/${m[2]}`;
}
export const _unusedReact = React;
