import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPatch } from '@/lib/api';
import { Paginated, Turf, TurfDetail } from '@/types';

/**
 * Approve/reject a turf, shared by the turfs list (AdminTurfsPage) and its
 * detail drawer so both stay in sync. Optimistic: the status badge flips the
 * instant the admin clicks, patched into every cached `admin-turfs` page
 * (list may have several cached filter/page combos) and the `admin-turf-detail`
 * cache for this turf, then rolled back from a snapshot if the request fails.
 */
export function useAdminTurfApproval() {
  const queryClient = useQueryClient();

  const patchStatus = (id: string, status: 'APPROVED' | 'REJECTED') => {
    queryClient.setQueriesData<{ data: Paginated<Turf> }>({ queryKey: ['admin-turfs'] }, (old) => {
      if (!old) return old;
      return { ...old, data: { ...old.data, items: old.data.items.map(t => t._id === id ? { ...t, approvalStatus: status } : t) } };
    });
    queryClient.setQueryData<{ data: TurfDetail }>(['admin-turf-detail', id], (old) =>
      old ? { ...old, data: { ...old.data, turf: { ...old.data.turf, approvalStatus: status } } } : old
    );
  };

  const snapshot = (id: string) => ({
    turfsQueries: queryClient.getQueriesData<{ data: Paginated<Turf> }>({ queryKey: ['admin-turfs'] }),
    detail: queryClient.getQueryData<{ data: TurfDetail }>(['admin-turf-detail', id]),
  });

  const rollback = (id: string, context?: ReturnType<typeof snapshot>) => {
    if (!context) return;
    context.turfsQueries.forEach(([key, data]) => queryClient.setQueryData(key, data));
    queryClient.setQueryData(['admin-turf-detail', id], context.detail);
  };

  const settle = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
    queryClient.invalidateQueries({ queryKey: ['admin-turf-detail', id] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/approve`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['admin-turfs'] });
      await queryClient.cancelQueries({ queryKey: ['admin-turf-detail', id] });
      const context = snapshot(id);
      patchStatus(id, 'APPROVED');
      return context;
    },
    onSuccess: () => toast.success('Turf approved'),
    onError: (error: Error, id, context) => {
      rollback(id, context);
      toast.error(error.message || 'Failed to approve turf');
    },
    onSettled: (_data, _err, id) => settle(id),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/reject`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['admin-turfs'] });
      await queryClient.cancelQueries({ queryKey: ['admin-turf-detail', id] });
      const context = snapshot(id);
      patchStatus(id, 'REJECTED');
      return context;
    },
    onSuccess: () => toast.success('Turf is no longer listed publicly'),
    onError: (error: Error, id, context) => {
      rollback(id, context);
      toast.error(error.message || 'Failed to reject turf');
    },
    onSettled: (_data, _err, id) => settle(id),
  });

  return { approveMutation, rejectMutation, isMutating: approveMutation.isPending || rejectMutation.isPending };
}
