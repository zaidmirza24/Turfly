import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';

/**
 * Route guard.
 *
 * `roles` omitted = any signed-in user. When the visitor isn't allowed we send
 * them to /login carrying the path they were trying to reach, so logging in
 * resumes what they were doing instead of dumping them on the home page.
 */
export function RequireRole({ roles, children }: { roles?: UserRole[]; children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-live="polite">
        <Loader2 className="animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Signed in, wrong role — a redirect to /login would be a lie ("you need
    // to log in" when they already are). Send them to their own home instead.
    const home = user.role === 'OWNER' ? '/owner' : user.role === 'ADMIN' ? '/admin' : '/dashboard';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
