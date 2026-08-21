import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MapPin, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/UserMenu';
import { cn } from '@/lib/utils';

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/turfs', label: 'Turfs', icon: MapPin },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-60 border-r bg-card flex-col p-4">
        <Link to="/" className="flex items-center gap-2 mb-6 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} aria-hidden="true" /> Back to site
        </Link>
        <div className="flex items-center justify-between gap-2 mb-4 px-2">
          <h2 className="font-bold text-lg">Admin Panel</h2>
          <UserMenu align="start" className="h-9 w-9" />
        </div>
        <nav className="space-y-1" aria-label="Admin sections">
          {links.map(l => (
            <Link key={l.to} to={l.to}>
              <Button variant={pathname === l.to ? 'secondary' : 'ghost'} className="w-full justify-start gap-2" size="sm">
                <l.icon size={16} aria-hidden="true" /> {l.label}
              </Button>
            </Link>
          ))}
        </nav>
      </aside>

      {/*
        Below md the sidebar is hidden, and there used to be nothing in its
        place — an admin on a phone could reach the overview and then had no
        way to get to Users or Turfs, or back to the site. This is the same
        bottom bar pattern the owner panel already uses.
      */}
      <nav
        aria-label="Admin sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card/95 backdrop-blur-xl border-t flex"
      >
        {links.map(l => {
          const isActive = pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-semibold min-h-[56px] justify-center',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <l.icon size={18} aria-hidden="true" />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 overflow-auto">
        {/* Below md the sidebar is hidden, so this is the only account
            control an admin has on a phone. */}
        <header className="md:hidden flex items-center justify-between gap-3 mb-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} aria-hidden="true" /> Back to site
          </Link>
          <UserMenu />
        </header>
        <Outlet />
      </main>
    </div>
  );
}
