import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MapPin, Activity, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Paginated, Turf } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { AdminTurfDetailDrawer } from './AdminTurfDetailDrawer';
import { useAdminTurfApproval } from './useAdminTurfApproval';

const LIMIT = 20;

export default function AdminTurfsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedTurf, setSelectedTurf] = useState<Turf | null>(null);

  const filters = { search, status, page };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-turfs', filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (status !== 'all') params.set('status', status.toUpperCase());
      if (search.trim()) params.set('search', search.trim());
      return apiGet<Paginated<Turf>>(`/admin/turfs?${params.toString()}`);
    },
  });

  const turfs = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  const { approveMutation, rejectMutation, isMutating } = useAdminTurfApproval();
  const resetToPage1 = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  if (isLoading) {
    return <SyncingIndicator label="Syncing Turfs" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Activity size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Admin Command Center</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">Turfs Management</h1>
          <p className="text-muted-foreground font-medium mt-1">Review, approve and moderate every venue on the platform.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative w-full lg:w-72 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search name or location..."
            value={search}
            onChange={(e) => resetToPage1(setSearch)(e.target.value)}
            aria-label="Search turfs"
            className="w-full h-12 pl-12 pr-4 rounded-2xl bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-background outline-none font-bold transition-all"
          />
        </div>

        <Select value={status} onValueChange={resetToPage1(setStatus)}>
          <SelectTrigger className="w-full lg:w-52 h-12 rounded-2xl bg-primary/5 border-2 border-transparent"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load turfs." onRetry={() => refetch()} />
      ) : turfs.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <Filter size={48} />
            <div className="space-y-1">
              <p className="text-lg font-black tracking-tighter text-foreground">No turfs found</p>
              <p className="text-sm font-medium">Try adjusting your search or filters</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {turfs.map(t => (
              <div key={t._id} onClick={() => setSelectedTurf(t)} className="glass rounded-[2rem] border-primary/10 p-5 shadow-xl shadow-black/5 space-y-3 cursor-pointer active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black tracking-tight truncate">{t.name}</div>
                      <div className="text-[10px] font-bold text-muted-foreground truncate">{t.location}</div>
                    </div>
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
                  <span className="font-black text-foreground">₹{t.pricePerHour}/hr</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {t.approvalStatus !== 'APPROVED' && (
                    <Button size="sm" disabled={isMutating} onClick={() => approveMutation.mutate(t._id)}>Approve</Button>
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

          <div className="hidden md:block glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Name</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Location</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Sport</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Price</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Status</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {turfs.map(t => (
                    <tr key={t._id} onClick={() => setSelectedTurf(t)} className="group hover:bg-primary/[0.02] transition-colors cursor-pointer">
                      <td className="p-6 font-black tracking-tight">{t.name}</td>
                      <td className="p-6 text-muted-foreground">{t.location}</td>
                      <td className="p-6 capitalize text-muted-foreground">{(t.sportsType || []).join(', ')}</td>
                      <td className="p-6 font-black">₹{t.pricePerHour}</td>
                      <td className="p-6">
                        <Badge
                          variant={t.approvalStatus === 'APPROVED' ? 'default' : t.approvalStatus === 'PENDING' ? 'secondary' : 'destructive'}
                          className="capitalize"
                        >
                          {(t.approvalStatus || 'PENDING').toLowerCase()}
                        </Badge>
                      </td>
                      <td className="p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {t.approvalStatus !== 'APPROVED' && (
                            <Button size="sm" disabled={isMutating} onClick={() => approveMutation.mutate(t._id)}>Approve</Button>
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

      <AdminTurfDetailDrawer
        turf={selectedTurf}
        open={!!selectedTurf}
        onOpenChange={(open) => { if (!open) setSelectedTurf(null); }}
      />
    </div>
  );
}
