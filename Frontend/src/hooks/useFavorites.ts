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

  const settle = () => queryClient.invalidateQueries({ queryKey: ['favorites'] });

  // Optimistic: the star/heart flips instantly, then quietly reconciles with
  // the server. On failure we roll the cache back to its pre-click snapshot
  // rather than just refetching, so the icon doesn't flicker back and forth.
  const addMutation = useMutation({
    mutationFn: (turf: Turf) => apiPost(`/users/me/favorites/${turf._id}`),
    onMutate: async (turf: Turf) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<{ data: Turf[] }>(['favorites']);
      queryClient.setQueryData<{ data: Turf[] } | undefined>(['favorites'], (old) => {
        const list = old?.data ?? [];
        if (list.some(t => t._id === turf._id)) return old;
        return { ...old, data: [turf, ...list] };
      });
      return { previous };
    },
    onError: (error: Error, _turf, context) => {
      if (context?.previous) queryClient.setQueryData(['favorites'], context.previous);
      toast.error(error.message || 'Failed to save favorite');
    },
    onSettled: settle,
  });

  const removeMutation = useMutation({
    mutationFn: (turfId: string) => apiDelete(`/users/me/favorites/${turfId}`),
    onMutate: async (turfId: string) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<{ data: Turf[] }>(['favorites']);
      queryClient.setQueryData<{ data: Turf[] } | undefined>(['favorites'], (old) =>
        old ? { ...old, data: old.data.filter(t => t._id !== turfId) } : old
      );
      return { previous };
    },
    onError: (error: Error, _turfId, context) => {
      if (context?.previous) queryClient.setQueryData(['favorites'], context.previous);
      toast.error(error.message || 'Failed to remove favorite');
    },
    onSettled: settle,
  });

  // Takes the full turf, not just an id, so an optimistic "add" has
  // something real to push into the favorites list cache.
  const toggleFavorite = (turf: Turf) => {
    if (!isCustomer) {
      toast.info('Log in as a player to save favorites');
      return;
    }
    if (favoriteIds.has(turf._id)) removeMutation.mutate(turf._id);
    else addMutation.mutate(turf);
  };

  return { favorites, favoriteIds, toggleFavorite, isCustomer };
}
