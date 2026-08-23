import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Complaint, ComplaintStatus, Paginated } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { formatSlotDate } from '@/lib/dateKey';

const LIMIT = 20;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

const STATUS_VARIANT: Record<ComplaintStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  OPEN: 'destructive',
  IN_PROGRESS: 'secondary',
  RESOLVED: 'outline',
  DISMISSED: 'outline',
};

function raiserName(c: Complaint) {
  return typeof c.raisedBy === 'object' ? c.raisedBy.name : 'Unknown';
}

function turfName(c: Complaint) {
  if (!c.turfId) return null;
  return typeof c.turfId === 'object' ? c.turfId.name : null;
}

function ComplaintDetailDrawer({ complaint, open, onOpenChange }: { complaint: Complaint | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ComplaintStatus>(complaint?.status ?? 'OPEN');
  const [note, setNote] = useState(complaint?.resolutionNote ?? '');

  const mutation = useMutation({
    mutationFn: () => apiPatch<Complaint>(`/admin/complaints/${complaint?._id}/resolve`, { status, resolutionNote: note || undefined }),
    onSuccess: () => {
      toast.success('Complaint updated');
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update complaint'),
  });

  if (!complaint) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setStatus(complaint.status);
          setNote(complaint.resolutionNote ?? '');
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tighter">Complaint</SheetTitle>
          <SheetDescription>Filed by {raiserName(complaint)} ({complaint.raisedByRole.toLowerCase()})</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[complaint.status]} className="capitalize">{complaint.status.toLowerCase().replace('_', ' ')}</Badge>
            <Badge variant="secondary" className="capitalize">{complaint.category.toLowerCase().replace('_', ' ')}</Badge>
          </div>

          {turfName(complaint) && (
            <p className="text-sm text-muted-foreground">Turf: <span className="font-semibold text-foreground">{turfName(complaint)}</span></p>
          )}

          <div>
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{complaint.description}</p>
          </div>

          <p className="text-xs text-muted-foreground">Filed {formatSlotDate(new Date(complaint.createdAt), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>

          <div className="pt-4 border-t space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Update status</p>
              <Select value={status} onValueChange={(v) => setStatus(v as ComplaintStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="DISMISSED">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Resolution note</p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done about this?" maxLength={1000} rows={3} />
            </div>
            <Button className="w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Complaint | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-complaints', statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      return apiGet<Paginated<Complaint>>(`/admin/complaints?${params.toString()}`);
    },
  });

  const complaints = data?.data?.items ?? [];
  const pages = data?.data?.pages ?? 1;
  const total = data?.data?.total ?? 0;

  if (isLoading) {
    return <SyncingIndicator label="Syncing Complaints" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <AlertOctagon size={16} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Admin Command Center</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Complaints</h1>
        <p className="text-muted-foreground font-medium mt-1">Issues reported by players and owners.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={statusFilter === f.value ? 'default' : 'outline'}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className="shrink-0"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load complaints." onRetry={() => refetch()} />
      ) : complaints.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <AlertOctagon size={48} />
            <p className="text-lg font-black tracking-tighter text-foreground">No complaints{statusFilter ? ' with this status' : ''}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {complaints.map((c) => (
              <button
                key={c._id}
                onClick={() => setSelected(c)}
                className="w-full text-left glass rounded-[2rem] border-primary/10 p-5 shadow-xl shadow-black/5 hover:bg-primary/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black tracking-tight truncate">{raiserName(c)} <span className="text-muted-foreground font-medium">({c.raisedByRole.toLowerCase()})</span></div>
                    <p className="text-sm text-muted-foreground truncate mt-1">{c.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">{c.status.toLowerCase().replace('_', ' ')}</Badge>
                    <Badge variant="secondary" className="capitalize">{c.category.toLowerCase().replace('_', ' ')}</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Page {page} of {pages} · {total} total</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <ComplaintDetailDrawer complaint={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
