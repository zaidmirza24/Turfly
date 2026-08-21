import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Turf } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Favorites live server-side (User.favorites), not localStorage — unlike
 * "recently viewed", this is something a customer expects to follow them
 * across devices once they've signed in.
 */
export function useFavorites() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const isCustomer = isAuthenticated && user?.role === 'USER';

  const { data: favoritesResponse } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => apiGet<Turf[]>('/users/me/favorites'),
    enabled: isCustomer,
  });

  const favorites = favoritesResponse?.data ?? [];
  const favoriteIds = new Set(favorites.map(t => t._id));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['favorites'] });

  const addMutation = useMutation({
    mutationFn: (turfId: string) => apiPost(`/users/me/favorites/${turfId}`),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || 'Failed to save favorite'),
  });

  const removeMutation = useMutation({
    mutationFn: (turfId: string) => apiDelete(`/users/me/favorites/${turfId}`),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || 'Failed to remove favorite'),
  });

  const toggleFavorite = (turfId: string) => {
    if (!isCustomer) {
      toast.info('Log in as a player to save favorites');
      return;
    }
    if (favoriteIds.has(turfId)) removeMutation.mutate(turfId);
    else addMutation.mutate(turfId);
  };

  return { favorites, favoriteIds, toggleFavorite, isCustomer };
}
