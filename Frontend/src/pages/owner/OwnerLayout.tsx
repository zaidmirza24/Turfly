import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, MapPin, Calendar, ClipboardList, ChevronLeft, User, LogOut, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

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
    <div className="min-h-screen flex bg-[#020617] text-slate-200 selection:bg-emerald-500/30">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 border-r border-white/5 bg-black/20 backdrop-blur-3xl flex-col p-6 sticky top-0 h-screen z-50">
        <Link to="/" className="flex items-center gap-3 mb-10 group px-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
            <ChevronLeft size={18} />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-white transition-colors">Return to Site</span>
        </Link>

        <div className="mb-10 px-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80">Active Terminal</span>
          </div>
          <h2 className="text-2xl font-black tracking-tighter text-white">Owner Panel</h2>
        </div>

        <nav className="flex-1 space-y-2">
          {links.map(l => {
            const isActive = pathname === l.to;
            return (
              <Link key={l.to} to={l.to}>
                <Button 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start gap-3 h-12 rounded-2xl transition-all duration-300 font-bold",
                    isActive 
                      ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  )}
                >
                  <l.icon size={18} className={cn(isActive ? "text-primary" : "opacity-50")} />
                  {l.label}
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="pt-6 border-t border-white/5 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black shadow-lg">
              {user?.name?.charAt(0) || 'O'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold truncate text-white">{user?.name || 'Owner Name'}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">Verified Partner</div>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            onClick={logout}
            className="w-full justify-start gap-3 h-12 rounded-2xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 font-bold transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-50 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex p-2 shadow-2xl shadow-black">
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="p-4 sm:p-8 md:p-12 pb-32 md:pb-12 max-w-7xl mx-auto relative z-10">
          <header className="flex items-center justify-end mb-10 md:hidden">
             <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <User size={20} />
             </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
