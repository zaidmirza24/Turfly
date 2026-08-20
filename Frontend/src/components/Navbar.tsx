import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, Menu, X, LogOut } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Navbar() {
  const { user, logout } = useAuth();
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
          {user?.role === 'OWNER' ? (
            <>
              <Link to="/owner" className={`text-sm font-medium transition-colors hover:text-primary ${pathname.startsWith('/owner') ? 'text-primary' : 'text-muted-foreground'}`}>Dashboard</Link>
              <Link to="/owner/turfs" className={`text-sm font-medium transition-colors hover:text-primary ${pathname === '/owner/turfs' ? 'text-primary' : 'text-muted-foreground'}`}>My Turfs</Link>
            </>
          ) : (
            <Link to="/dashboard" className={`text-sm font-medium transition-colors hover:text-primary ${pathname === '/dashboard' ? 'text-primary' : 'text-muted-foreground'}`}>My Bookings</Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 border border-border">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 mt-2 shadow-xl border-border/50">
                <DropdownMenuLabel className="font-normal px-2 py-3 border-b mb-1">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-bold leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    <Badge variant="outline" className="w-fit mt-1 text-[10px] uppercase font-bold">{user.role}</Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate(user.role === 'OWNER' ? '/owner' : '/dashboard')} className="rounded-xl cursor-pointer">
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-destructive rounded-xl cursor-pointer focus:bg-destructive/10">
                  <LogOut size={14} className="mr-2" />Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={() => navigate('/login')}>Login</Button>
              <Button className="rounded-xl px-6 gradient-primary text-white shadow-lg shadow-primary/20" onClick={() => navigate('/signup')}>Sign Up</Button>
            </div>
          )}
          <ThemeToggle />

          <Button variant="ghost" size="icon" className="md:hidden h-9 w-9" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-4 py-4 space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col gap-2">
            <Link to="/turfs" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>Explore</Link>
            {user?.role === 'OWNER' ? (
              <>
                <Link to="/owner" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                <Link to="/owner/turfs" className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-xl" onClick={() => setMobileOpen(false)}>My Turfs</Link>
              </>
            ) : (
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
