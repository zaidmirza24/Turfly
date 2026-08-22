import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MapPin, ClipboardList, UserCircle, History, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/UserMenu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/turfs', label: 'Turfs', icon: MapPin },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { to: '/admin/customers', label: 'Customers', icon: UserCircle },
  { to: '/admin/activity', label: 'Activity', icon: History },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex bg-background text-foreground selection:bg-primary/20">
      <aside className="hidden md:flex w-72 border-r bg-card flex-col p-6 sticky top-0 h-screen z-50">
        <Link to="/" className="flex items-center gap-3 mb-10 group px-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
            <ChevronLeft size={18} />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-foreground transition-colors">Return to Site</span>
        </Link>

        <div className="mb-10 px-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">Platform Control</span>
          </div>
          <h2 className="text-2xl font-black tracking-tighter">Admin Panel</h2>
        </div>

        <nav className="flex-1 space-y-2" aria-label="Admin sections">
          {links.map(l => {
            const isActive = pathname === l.to;
            return (
              <Link key={l.to} to={l.to} aria-current={isActive ? 'page' : undefined}>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start gap-3 h-12 rounded-2xl transition-all duration-300 font-bold',
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <l.icon size={18} className={cn(isActive ? 'text-primary' : 'opacity-50')} />
                  {l.label}
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="pt-6 border-t space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted border">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black">
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold truncate">{user?.name || 'Admin'}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">Administrator</div>
            </div>
            <UserMenu align="end" />
          </div>
        </div>
      </aside>

      {/*
        Below md the sidebar is hidden, and there used to be nothing in its
        place — an admin on a phone could reach the overview and then had no
        way to get to the other sections, or back to the site. Same bottom
        pill-nav pattern the owner panel uses.
      */}
      <nav
        aria-label="Admin sections"
        className="md:hidden fixed left-4 right-4 z-50 bg-card/95 backdrop-blur-2xl border rounded-[2rem] flex p-1.5 shadow-2xl overflow-x-auto"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {links.map(l => {
          const isActive = pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 px-1 text-[9px] font-black uppercase tracking-widest gap-1 transition-all rounded-full min-w-[56px]',
                isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground'
              )}
            >
              <l.icon size={17} aria-hidden="true" />
              <span className="scale-[0.85]">{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 min-h-screen relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="p-4 sm:p-8 md:p-12 pb-28 md:pb-12 max-w-7xl mx-auto relative z-10">
          {/* Below md the sidebar is hidden, so this is the only account
              control an admin has on a phone. */}
          <header className="flex items-center justify-between gap-3 mb-8 md:hidden">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Admin panel</div>
              <div className="text-sm font-bold truncate">{user?.name || 'Admin'}</div>
            </div>
            <UserMenu />
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
