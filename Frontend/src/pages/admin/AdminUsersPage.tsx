import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Users, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Paginated, User } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';

const LIMIT = 20;

const APPROVAL_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending owners' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const filters = { search, approvalFilter, page };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search.trim()) params.set('search', search.trim());
      if (approvalFilter) params.set('approvalStatus', approvalFilter);
      return apiGet<Paginated<User>>(`/admin/users?${params.toString()}`);
    },
  });

  const users = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  const banMutation = useMutation({
    mutationFn: ({ id, isBanned }: { id: string; isBanned: boolean }) => apiPatch<User>(`/admin/users/${id}/ban`, { isBanned }),
    onMutate: async ({ id, isBanned }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] });
      const previous = queryClient.getQueriesData<{ data: Paginated<User> }>({ queryKey: ['admin-users'] });
      queryClient.setQueriesData<{ data: Paginated<User> }>({ queryKey: ['admin-users'] }, (old) => {
        if (!old) return old;
        return { ...old, data: { ...old.data, items: old.data.items.map(u => u._id === id ? { ...u, isBanned } : u) } };
      });
      return { previous };
    },
    onSuccess: (_res, variables) => toast.success(variables.isBanned ? 'User banned' : 'User unbanned'),
    onError: (error: Error, _variables, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message || 'Failed to update user');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, approvalStatus }: { id: string; approvalStatus: 'APPROVED' | 'REJECTED' }) =>
      apiPatch<User>(`/admin/users/${id}/approval`, { approvalStatus }),
    onMutate: async ({ id, approvalStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-users'] });
      const previous = queryClient.getQueriesData<{ data: Paginated<User> }>({ queryKey: ['admin-users'] });
      queryClient.setQueriesData<{ data: Paginated<User> }>({ queryKey: ['admin-users'] }, (old) => {
        if (!old) return old;
        return { ...old, data: { ...old.data, items: old.data.items.map(u => u._id === id ? { ...u, approvalStatus } : u) } };
      });
      return { previous };
    },
    onSuccess: (_res, variables) => toast.success(variables.approvalStatus === 'APPROVED' ? 'Owner approved' : 'Owner rejected'),
    onError: (error: Error, _variables, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error.message || 'Failed to update approval');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (isLoading) {
    return <SyncingIndicator label="Syncing Users" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Activity size={16} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Admin Command Center</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Users</h1>
        <p className="text-muted-foreground font-medium mt-1">Everyone registered on the platform.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative w-full lg:w-72 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search users"
            className="w-full h-12 pl-12 pr-4 rounded-2xl bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-background outline-none font-bold transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {APPROVAL_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={approvalFilter === f.value ? 'default' : 'outline'}
              onClick={() => { setApprovalFilter(f.value); setPage(1); }}
              className="shrink-0"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load users." onRetry={() => refetch()} />
      ) : users.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <Users size={48} />
            <p className="text-lg font-black tracking-tighter text-foreground">{search ? 'No users match that search' : 'No users yet'}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {users.map(u => (
              <div key={u._id} className="glass rounded-[2rem] border-primary/10 p-5 shadow-xl shadow-black/5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black tracking-tight truncate">{u.name}</div>
                    <div className="text-[10px] font-bold text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="capitalize shrink-0">{u.role.toLowerCase()}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={u.isBanned ? 'destructive' : 'outline'}>{u.isBanned ? 'Banned' : 'Active'}</Badge>
                    {u.role === 'OWNER' && (
                      <Badge variant={u.approvalStatus === 'APPROVED' ? 'outline' : u.approvalStatus === 'REJECTED' ? 'destructive' : 'secondary'}>
                        {u.approvalStatus === 'PENDING' ? 'Pending approval' : u.approvalStatus === 'REJECTED' ? 'Rejected' : 'Approved'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {u.role === 'OWNER' && u.approvalStatus === 'PENDING' && (
                      <>
                        <Button size="sm" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: u._id, approvalStatus: 'APPROVED' })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: u._id, approvalStatus: 'REJECTED' })}>
                          Reject
                        </Button>
                      </>
                    )}
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
              </div>
            ))}
          </div>

          <div className="hidden md:block glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Name</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Email</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Role</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Status</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {users.map(u => (
                    <tr key={u._id} className="hover:bg-primary/[0.02] transition-colors">
                      <td className="p-6 font-black tracking-tight">{u.name}</td>
                      <td className="p-6 text-muted-foreground">{u.email}</td>
                      <td className="p-6"><Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="capitalize">{u.role.toLowerCase()}</Badge></td>
                      <td className="p-6">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={u.isBanned ? 'destructive' : 'outline'}>{u.isBanned ? 'Banned' : 'Active'}</Badge>
                          {u.role === 'OWNER' && (
                            <Badge variant={u.approvalStatus === 'APPROVED' ? 'outline' : u.approvalStatus === 'REJECTED' ? 'destructive' : 'secondary'}>
                              {u.approvalStatus === 'PENDING' ? 'Pending approval' : u.approvalStatus === 'REJECTED' ? 'Rejected' : 'Approved'}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2">
                          {u.role === 'OWNER' && u.approvalStatus === 'PENDING' && (
                            <>
                              <Button size="sm" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: u._id, approvalStatus: 'APPROVED' })}>
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ id: u._id, approvalStatus: 'REJECTED' })}>
                                Reject
                              </Button>
                            </>
                          )}
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Page {page} of {pages} · {total} total</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
