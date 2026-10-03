import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeOf } from '@/store/auth';
import { Button } from '@/components/ui';
import { AleshaWidget } from '@/components/AleshaWidget';
import { SinauLogo } from '@/components/SinauLogo';

export default function PublicLayout() {
  const { user, activeRole } = useAuth();
  const loc = useLocation();
  const inTenant = loc.pathname.startsWith('/s/') || loc.pathname.startsWith('/ppdb/');
  return (
    <div className="flex min-h-screen flex-col bg-surface-2 overflow-x-hidden">
      {!inTenant && (
        <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link to="/welcome" className="group flex items-center transition-opacity hover:opacity-95">
              <SinauLogo size="md" />
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link to="/portal" className="rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-3">Portal Materi</Link>
              {user ? <Link to={homeOf(activeRole)}><Button size="sm">Ke dashboard</Button></Link> : <Link to="/login"><Button size="sm">Masuk</Button></Link>}
            </nav>
          </div>
        </header>
      )}
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">© {new Date().getFullYear()} SINAU — Learn. Teach. Improve. Grow.</footer>
      <AleshaWidget />
    </div>
  );
}
