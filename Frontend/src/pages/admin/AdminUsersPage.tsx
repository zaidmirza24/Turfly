import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Users, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { Paginated, User } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { PaginationFooter } from '@/components/PaginationFooter';
import { usePageQueryParam } from '@/hooks/usePageQueryParam';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

const LIMIT = 20;

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const { page, setPage, resetPage } = usePageQueryParam();
  const queryClient = useQueryClient();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetPage(); }, [debouncedSearch]);

  const filters = { search: debouncedSearch, page };
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      return apiGet<Paginated<User>>(`/admin/users?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
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
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
            className="w-full h-12 pl-12 pr-4 rounded-2xl bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-background outline-none font-bold transition-all"
          />
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
        <div className={cn('space-y-10 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
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
                  </div>
                  <div className="flex items-center gap-2">
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
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2">
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

          <PaginationFooter page={page} pages={pages} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
