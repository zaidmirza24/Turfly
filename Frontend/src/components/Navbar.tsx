import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';

export function Navbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-lg bg-primary/10 group-hover:rotate-12 transition-transform">
            <Trophy size={20} className="text-primary" />
          </div>
          <span className="text-xl font-black tracking-tighter text-gradient">TURFBOOK</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/turfs" className={`text-sm font-medium transition-colors hover:text-primary ${pathname === '/turfs' ? 'text-primary' : 'text-muted-foreground'}`}>Explore</Link>
          {user?.role === 'OWNER' && (
            <>
              <Link to="/owner" className={`text-sm font-medium transition-colors hover:text-primary ${pathname.startsWith('/owner') ? 'text-primary' : 'text-muted-foreground'}`}>Dashboard</Link>
              <Link to="/owner/turfs" className={`text-sm font-medium transition-colors hover:text-primary ${pathname === '/owner/turfs' ? 'text-primary' : 'text-muted-foreground'}`}>My Turfs</Link>
            </>
          )}
          {/* An admin used to be shown "My Bookings" and nothing else — there
              was no link to /admin anywhere in the app, so the panel was only
              reachable by typing the URL. */}
          {user?.role === 'ADMIN' && (
            <Link to="/admin" className={`text-sm font-medium transition-colors hover:text-primary ${pathname.startsWith('/admin') ? 'text-primary' : 'text-muted-foreground'}`}>Admin Panel</Link>
          )}
          {user?.role !== 'OWNER' && user?.role !== 'ADMIN' && (
            <Link to="/dashboard" className={`text-sm font-medium transition-colors hover:text-primary ${pathname === '/dashboard' ? 'text-primary' : 'text-muted-foreground'}`}>My Bookings</Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <UserMenu />
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={() => navigate('/login')}>Login</Button>
              <Button className="rounded-xl px-6 gradient-primary text-white shadow-lg shadow-primary/20" onClick={() => navigate('/signup')}>Sign Up</Button>
            </div>
          )}
          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-4 py-4 space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col gap-2">
            <Link to="/turfs" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>Explore</Link>
            {user?.role === 'OWNER' && (
              <>
                <Link to="/owner" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                <Link to="/owner/turfs" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>My Turfs</Link>
              </>
            )}
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>Admin Panel</Link>
            )}
            {user?.role !== 'OWNER' && user?.role !== 'ADMIN' && (
              <Link to="/dashboard" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>My Bookings</Link>
            )}
          </div>
          {!user && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <Button variant="outline" className="rounded-xl" onClick={() => { navigate('/login'); setMobileOpen(false); }}>Login</Button>
              <Button className="rounded-xl gradient-primary" onClick={() => { navigate('/signup'); setMobileOpen(false); }}>Sign Up</Button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
