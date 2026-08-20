import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Turf } from '@/types';
import { TableSkeleton } from '@/components/Skeletons';

export default function AdminTurfsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-turfs'],
    queryFn: () => api.get('/admin/turfs'),
  });

  const turfs = ((data as any)?.data as Turf[]) || [];

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/turfs/${id}/approve`),
    onSuccess: () => {
      toast.success('Turf approved');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
    },
    onError: (error: any) => toast.error(error.message || 'Failed to approve turf'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/turfs/${id}/reject`),
    onSuccess: () => {
      toast.success('Turf rejected');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
    },
    onError: (error: any) => toast.error(error.message || 'Failed to reject turf'),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Turfs Management</h1>
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="border rounded-xl overflow-hidden">
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
                      {t.approvalStatus === 'PENDING' && (
                        <div className="flex gap-1">
                          <Button size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(t._id)}>Approve</Button>
                          <Button size="sm" variant="destructive" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(t._id)}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
