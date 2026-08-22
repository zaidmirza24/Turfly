import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, History, Activity } from 'lucide-react';
import { AuditLogEntry, Paginated } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { AuditLogRow } from './AuditLogRow';

const LIMIT = 25;

export default function AdminActivityPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-audit-log', page],
    queryFn: () => apiGet<Paginated<AuditLogEntry>>(`/admin/audit-log?page=${page}&limit=${LIMIT}`),
  });

  const entries = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  if (isLoading) {
    return <SyncingIndicator label="Syncing Activity" />;
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
        <h1 className="text-4xl font-black tracking-tighter">Activity Log</h1>
        <p className="text-muted-foreground font-medium mt-1">Every turf, user and booking action taken by an admin.</p>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load the activity log." onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <History size={48} />
            <p className="text-lg font-black tracking-tighter text-foreground">No admin activity yet</p>
          </div>
        </div>
      ) : (
        <>
          <div className="glass-card rounded-[3rem] p-4 border-primary/10 space-y-1">
            {entries.map((entry) => <AuditLogRow key={entry._id} entry={entry} />)}
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
