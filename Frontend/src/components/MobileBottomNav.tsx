import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Heart, CalendarDays, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/turfs', label: 'Search', icon: Search },
  { to: '/favorites', label: 'Favorites', icon: Heart, requiresAuth: true },
  { to: '/dashboard', label: 'Bookings', icon: CalendarDays, requiresAuth: true },
  { to: '/account', label: 'Account', icon: User, requiresAuth: true },
];

/**
 * Customer-facing bottom tab bar, mobile only. Owner/admin panels have their
 * own sidebar-driven navigation and are excluded — this is specifically the
 * "one-handed, thumb-reachable" nav the mobile-UX checklist asks for on the
 * browse → book path.
 */
export function MobileBottomNav() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  // Hidden on the booking flow and turf detail pages — both already have
  // their own sticky CTA bar at the bottom, and stacking two fixed bottom
  // bars would eat a meaningful chunk of a phone screen and risk overlapping.
  if (pathname.startsWith('/booking/') || pathname.startsWith('/turfs/')) return null;

  const visibleItems = items.filter(i => !i.requiresAuth || isAuthenticated);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {visibleItems.map(item => {
        const targetTo = item.requiresAuth && !isAuthenticated ? '/login' : item.to;
        return (
          <NavLink
            key={item.to}
            to={targetTo}
            end={item.end}
            className={({ isActive }) => cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold min-h-[56px]',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
