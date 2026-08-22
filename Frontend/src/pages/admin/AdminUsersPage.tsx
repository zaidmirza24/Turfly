import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { User } from '@/types';
import { TableSkeleton } from '@/components/Skeletons';
import { QueryErrorState } from '@/components/QueryErrorState';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiGet<User[]>('/admin/users'),
  });

  const users = data?.data ?? [];
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  const banMutation = useMutation({
    mutationFn: ({ id, isBanned }: { id: string; isBanned: boolean }) => apiPatch<User>(`/admin/users/${id}/ban`, { isBanned }),
    onSuccess: (_res, variables) => {
      toast.success(variables.isBanned ? 'User banned' : 'User unbanned');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update user'),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <QueryErrorState message="Couldn't load users." onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <p className="font-medium">{search ? 'No users match that search' : 'No users yet'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map(u => (
              <div key={u._id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="capitalize shrink-0">{u.role.toLowerCase()}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={u.isBanned ? 'destructive' : 'outline'}>{u.isBanned ? 'Banned' : 'Active'}</Badge>
                  {u.role !== 'ADMIN' && (
                    <Button
                      size="sm"
                      variant={u.isBanned ? 'outline' : 'destructive'}
                      disabled={banMutation.isPending}
                      onClick={() => banMutation.mutate({ id: u._id, isBanned: !u.isBanned })}
                    >
                      {u.isBanned ? 'Unban' : 'Ban'}
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
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u._id} className="border-t">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-muted-foreground">{u.email}</td>
                      <td className="p-3"><Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="capitalize">{u.role.toLowerCase()}</Badge></td>
                      <td className="p-3"><Badge variant={u.isBanned ? 'destructive' : 'outline'}>{u.isBanned ? 'Banned' : 'Active'}</Badge></td>
                      <td className="p-3">
                        {u.role !== 'ADMIN' && (
                          <Button
                            size="sm"
                            variant={u.isBanned ? 'outline' : 'destructive'}
                            disabled={banMutation.isPending}
                            onClick={() => banMutation.mutate({ id: u._id, isBanned: !u.isBanned })}
                          >
                            {u.isBanned ? 'Unban' : 'Ban'}
                          </Button>
                        )}
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
