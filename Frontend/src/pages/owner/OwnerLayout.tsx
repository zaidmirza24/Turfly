import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, MapPin, Calendar, ClipboardList, ChevronLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/UserMenu';

const links = [
  { to: '/owner', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/owner/turfs', label: 'Manage Turfs', icon: MapPin },
  { to: '/owner/slots', label: 'Slot Management', icon: Calendar },
  { to: '/owner/bookings', label: 'Bookings', icon: ClipboardList },
];

export default function OwnerLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-background text-foreground selection:bg-primary/20">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 border-r bg-card flex-col p-6 sticky top-0 h-screen z-50">
        <Link to="/" className="flex items-center gap-3 mb-10 group px-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
            <ChevronLeft size={18} />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-foreground transition-colors">Return to Site</span>
        </Link>

        <div className="mb-10 px-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-success/80">Active Terminal</span>
          </div>
          <h2 className="text-2xl font-black tracking-tighter">Owner Panel</h2>
        </div>

        <nav className="flex-1 space-y-2">
          {links.map(l => {
            const isActive = pathname === l.to;
            return (
              <Link key={l.to} to={l.to} aria-current={isActive ? 'page' : undefined}>
                <Button 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start gap-3 h-12 rounded-2xl transition-all duration-300 font-bold",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <l.icon size={18} className={cn(isActive ? "text-primary" : "opacity-50")} />
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
              {user?.name?.charAt(0) || 'O'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold truncate">{user?.name || 'Owner Name'}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">Verified Partner</div>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start gap-3 h-12 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div
        className="md:hidden fixed left-6 right-6 z-50 bg-card/95 backdrop-blur-2xl border rounded-[2.5rem] flex p-2 shadow-2xl"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {links.map(l => {
          const isActive = pathname === l.to;
          return (
            <Link key={l.to} to={l.to} className={cn(
              'flex-1 flex flex-col items-center py-3 text-[10px] font-black uppercase tracking-widest gap-1.5 transition-all rounded-full', 
              isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground'
            )}>
              <l.icon size={20} className={isActive ? "animate-pulse" : ""} />
              <span className="scale-[0.8]">{l.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>

      <main className="flex-1 min-h-screen relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="p-4 sm:p-8 md:p-12 pb-32 md:pb-12 max-w-7xl mx-auto relative z-10">
          {/*
            The sidebar — and with it the only Sign Out control — is hidden
            below md. This slot used to hold a User icon that wasn't a button
            and did nothing, so a phone user had no way to log out at all.
            UserMenu is the same account menu the public navbar uses.
          */}
          <header className="flex items-center justify-between gap-3 mb-8 md:hidden">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                Owner panel
              </div>
              <div className="text-sm font-bold truncate">{user?.name || 'Owner'}</div>
            </div>
            <UserMenu />
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
