import { useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Compass, User as UserIcon, Settings, Heart, LifeBuoy } from 'lucide-react';
import { resolveImageUrl } from '@/lib/imageUrl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';

/** Where each role's own landing page lives. */
const HOME_FOR_ROLE: Record<UserRole, string> = {
  OWNER: '/owner',
  ADMIN: '/admin',
  USER: '/dashboard',
};

const DASHBOARD_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner dashboard',
  ADMIN: 'Admin panel',
  USER: 'My bookings',
};

interface Props {
  /** Which side of the trigger the panel aligns to. */
  align?: 'start' | 'end';
  className?: string;
}

/**
 * The signed-in user's avatar and account menu.
 *
 * Shared by the public navbar and both admin panels so there is exactly one
 * implementation of "who am I / how do I get out". The owner and admin layouts
 * hide their sidebar below `md`, and the sidebar is where sign-out lives — so
 * without this, the only control in the mobile header was a decorative icon
 * and a phone user had no way to log out at all.
 */
export function UserMenu({ align = 'end', className }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const home = HOME_FOR_ROLE[user.role] ?? '/dashboard';

  const handleLogout = () => {
    logout();
    // Land somewhere public: staying put on a role-guarded page would just
    // bounce through the route guard to the login screen.
    navigate('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          // 44px: this is the primary (often only) account control on a phone,
          // and the smallest comfortable touch target.
          className={cn('relative h-11 w-11 rounded-full p-0 border border-border shrink-0', className)}
          aria-label={`Account menu for ${user.name}`}
        >
          <Avatar className="h-9 w-9">
            {user.avatar && <AvatarImage src={resolveImageUrl(user.avatar)} alt="" />}
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {user.name?.charAt(0).toUpperCase() || <UserIcon size={16} aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-60 rounded-2xl p-2 mt-2 shadow-xl border-border/50">
        <DropdownMenuLabel className="font-normal px-2 py-3">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-bold leading-none truncate">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
            <Badge variant="outline" className="w-fit mt-1.5 text-[10px] uppercase font-bold">
              {user.role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate(home)} className="rounded-xl cursor-pointer gap-2">
          <LayoutDashboard size={14} aria-hidden="true" />
          {DASHBOARD_LABEL[user.role] ?? 'Dashboard'}
        </DropdownMenuItem>

        {/*
          An owner or admin inside their panel has no navbar, so on a phone this
          is the only way back to the public site.
        */}
        <DropdownMenuItem onClick={() => navigate('/turfs')} className="rounded-xl cursor-pointer gap-2">
          <Compass size={14} aria-hidden="true" />
          Browse turfs
        </DropdownMenuItem>

        {user.role === 'USER' && (
          <DropdownMenuItem onClick={() => navigate('/favorites')} className="rounded-xl cursor-pointer gap-2">
            <Heart size={14} aria-hidden="true" />
            Favorites
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => navigate('/account')} className="rounded-xl cursor-pointer gap-2">
          <Settings size={14} aria-hidden="true" />
          Account settings
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => navigate('/help')} className="rounded-xl cursor-pointer gap-2">
          <LifeBuoy size={14} aria-hidden="true" />
          Help &amp; support
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive rounded-xl cursor-pointer gap-2 focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut size={14} aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenu;
