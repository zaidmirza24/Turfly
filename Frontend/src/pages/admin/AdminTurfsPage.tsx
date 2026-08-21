import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Turf } from '@/types';
import { TableSkeleton } from '@/components/Skeletons';

export default function AdminTurfsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-turfs'],
    queryFn: () => apiGet<Turf[]>('/admin/turfs'),
  });

  const turfs = data?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/approve`),
    onSuccess: () => {
      toast.success('Turf approved');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to approve turf'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/reject`),
    onSuccess: () => {
      toast.success('Turf is no longer listed publicly');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to reject turf'),
  });

  const isMutating = approveMutation.isPending || rejectMutation.isPending;
  const pendingCount = turfs.filter(t => (t.approvalStatus ?? 'PENDING') === 'PENDING').length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-bold">Turfs Management</h1>
        {pendingCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {pendingCount} awaiting review
          </span>
        )}
      </div>
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : turfs.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <p className="font-medium">No turfs submitted yet</p>
          <p className="text-sm mt-1">Listings appear here as soon as an owner creates one.</p>
        </div>
      ) : (
        <>
          {/*
            Actions used to render only while a turf was PENDING, so approving
            or rejecting was irreversible from the UI: a turf approved by
            mistake could not be taken down, and a rejected one could never be
            reconsidered. Both transitions are available in the API — show
            whichever one isn't the current state. Same logic drives both the
            mobile cards and the desktop table below.
          */}
          <div className="md:hidden space-y-3">
            {turfs.map(t => (
              <div key={t._id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{t.location}</div>
                  </div>
                  <Badge
                    variant={t.approvalStatus === 'APPROVED' ? 'default' : t.approvalStatus === 'PENDING' ? 'secondary' : 'destructive'}
                    className="capitalize shrink-0"
                  >
                    {(t.approvalStatus || 'PENDING').toLowerCase()}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="capitalize">{(t.sportsType || []).join(', ')}</span>
                  <span className="mx-2">·</span>
                  <span>₹{t.pricePerHour}/hr</span>
                </div>
                <div className="flex gap-2">
                  {t.approvalStatus !== 'APPROVED' && (
                    <Button size="sm" disabled={isMutating} onClick={() => approveMutation.mutate(t._id)}>
                      Approve
                    </Button>
                  )}
                  {t.approvalStatus !== 'REJECTED' && (
                    <Button
                      size="sm"
                      variant={t.approvalStatus === 'APPROVED' ? 'outline' : 'destructive'}
                      disabled={isMutating}
                      onClick={() => rejectMutation.mutate(t._id)}
                    >
                      {t.approvalStatus === 'APPROVED' ? 'Unlist' : 'Reject'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Location</th>
                    <th className="text-left p-3 font-medium">Sport</th>
                    <th className="text-left p-3 font-medium">Price</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {turfs.map(t => (
                    <tr key={t._id} className="border-t">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 text-muted-foreground">{t.location}</td>
                      <td className="p-3 capitalize">{(t.sportsType || []).join(', ')}</td>
                      <td className="p-3">₹{t.pricePerHour}</td>
                      <td className="p-3">
                        <Badge
                          variant={t.approvalStatus === 'APPROVED' ? 'default' : t.approvalStatus === 'PENDING' ? 'secondary' : 'destructive'}
                          className="capitalize"
                        >
                          {(t.approvalStatus || 'PENDING').toLowerCase()}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {t.approvalStatus !== 'APPROVED' && (
                            <Button size="sm" disabled={isMutating} onClick={() => approveMutation.mutate(t._id)}>
                              Approve
                            </Button>
                          )}
                          {t.approvalStatus !== 'REJECTED' && (
                            <Button
                              size="sm"
                              variant={t.approvalStatus === 'APPROVED' ? 'outline' : 'destructive'}
                              disabled={isMutating}
                              onClick={() => rejectMutation.mutate(t._id)}
                            >
                              {t.approvalStatus === 'APPROVED' ? 'Unlist' : 'Reject'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
