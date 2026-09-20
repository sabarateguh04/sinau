import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth, homeOf } from '@/store/auth';
import { Loading, Toaster } from '@/components/ui';
import AppShell from '@/layouts/AppShell';
import { PAGES } from '@/pages/registry';
import { PREFIX_ROLE, Role } from '@/lib/types';
import Login from '@/pages/auth/Login';
import PublicLayout from '@/pages/public/PublicLayout';
import Landing from '@/pages/public/Landing';
import TenantSite from '@/pages/public/TenantSite';
import PpdbPublic from '@/pages/public/PpdbPublic';
import Portal from '@/pages/public/Portal';
import { applyTheme } from '@/lib/brand';

function Boot({ children }: { children: React.ReactNode }) {
  const { ready, refreshMe } = useAuth();
  useEffect(() => { applyTheme('system'); refreshMe(); }, [refreshMe]);
  if (!ready) return <div className="flex h-screen items-center justify-center"><Loading label="Menyiapkan SINAU…" /></div>;
  return <>{children}</>;
}

/** /:prefix/* — validates that the URL prefix is one of the user's roles, syncs the active role, and renders the page registry. */
function RoleArea() {
  const { prefix } = useParams();
  const { user, activeRole, setActiveRole, has } = useAuth();
  const loc = useLocation();
  const role = prefix ? PREFIX_ROLE[prefix] : undefined;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!role || !user.roles.includes(role)) return <Navigate to={homeOf(activeRole)} replace />;
  if (activeRole !== role) { setActiveRole(role as Role); }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        {PAGES.filter((p) => !p.perm || (Array.isArray(p.perm) ? p.perm : [p.perm]).some((x) => has(x))).map((p) => (
          <Route key={p.path} path={p.path} element={<Suspense fallback={<Loading />}><p.component /></Suspense>} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
function NotFound() { return <div className="py-24 text-center"><div className="text-6xl font-black text-ink-3">404</div><p className="mt-2 text-sm text-ink-2">Halaman tidak ditemukan.</p></div>; }

function Home() {
  const { user, activeRole } = useAuth();
  return <Navigate to={user ? homeOf(activeRole) : '/welcome'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Boot>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<Login mode="reset" />} />
          <Route path="/undangan" element={<Login mode="invite" />} />
          <Route element={<PublicLayout />}>
            <Route path="/welcome" element={<Landing />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/portal/:id" element={<Portal />} />
            <Route path="/s/:slug" element={<TenantSite />} />
            <Route path="/s/:slug/:page" element={<TenantSite />} />
            <Route path="/s/:slug/berita/:newsSlug" element={<TenantSite />} />
            <Route path="/ppdb/:slug" element={<PpdbPublic />} />
            <Route path="/ppdb/:slug/:view" element={<PpdbPublic />} />
          </Route>
          <Route path="/:prefix/*" element={<RoleArea />} />
        </Routes>
        <Toaster />
      </Boot>
    </BrowserRouter>
  );
}
