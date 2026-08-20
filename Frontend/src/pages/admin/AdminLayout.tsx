import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MapPin, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <Link to="/" className="flex items-center gap-2 mb-6 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft size={16} /> Back to site</Link>
        <h2 className="font-bold text-lg mb-4 px-2">Admin Panel</h2>
        <nav className="space-y-1">
          {links.map(l => (
            <Link key={l.to} to={l.to}><Button variant={pathname === l.to ? 'secondary' : 'ghost'} className="w-full justify-start gap-2" size="sm"><l.icon size={16} /> {l.label}</Button></Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 sm:p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
