import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Booking, Paginated, PendingPayoutSummary, Payout } from '@/types';
import { bookingTurf } from '@/lib/booking';
import { formatSlotDate } from '@/lib/dateKey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Wallet, ChevronDown, ChevronUp, Loader2, AlertTriangle, History } from 'lucide-react';
import { toast } from 'sonner';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { PaginationFooter } from '@/components/PaginationFooter';
import { usePageQueryParam } from '@/hooks/usePageQueryParam';
import { cn } from '@/lib/utils';

function PayoutDetailsSummary({ owner }: { owner: PendingPayoutSummary }) {
  const d = owner.payoutDetails;
  if (!d) return <span className="text-destructive font-bold">No payout details on file</span>;
  if (d.method === 'UPI') return <span>UPI · {d.upiId}</span>;
  return <span>Bank · {d.bankAccountHolder} · {d.bankAccountNumber} ({d.bankIfsc})</span>;
}

function MarkPaidDialog({ booking, onSettled }: { booking: Booking; onSettled: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'OTHER'>('UPI');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiPatch(`/bookings/${booking._id}/payout`, { method, note: note || undefined }),
    onSuccess: () => {
      toast.success('Payout recorded');
      setOpen(false);
      onSettled();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to record payout'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Mark Paid</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payout for this booking</DialogTitle>
          <DialogDescription>
            Confirms you already sent ₹{booking.ownerAmount ?? 0} to the owner outside the app. This does not move any money itself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Method used</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="payout-note">Reference / note (optional)</Label>
            <Input id="payout-note" value={note} onChange={e => setNote(e.target.value)} placeholder="UTR / transaction id" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            Confirm Payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OwnerPendingRow({ owner }: { owner: PendingPayoutSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-payouts-owner-bookings', owner.ownerId, page],
    queryFn: () => apiGet<Paginated<Booking>>(`/admin/payouts/pending/${owner.ownerId}/bookings?page=${page}&limit=20`),
    enabled: expanded,
    placeholderData: keepPreviousData,
  });

  const bookings = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-payouts-pending'] });
    queryClient.invalidateQueries({ queryKey: ['admin-payouts-owner-bookings', owner.ownerId] });
    queryClient.invalidateQueries({ queryKey: ['admin-payouts-history'] });
  };

  return (
    <div className="border-b border-primary/5 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-primary/[0.02] transition-colors"
      >
        <div className="min-w-0">
          <div className="font-bold truncate">{owner.ownerName}</div>
          <div className="text-[11px] text-muted-foreground truncate">{owner.ownerEmail}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
            <PayoutDetailsSummary owner={owner} />
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="font-black text-lg tracking-tighter">₹{owner.pendingAmount.toLocaleString('en-IN')}</div>
            <div className="text-[10px] font-bold text-muted-foreground">{owner.pendingCount} booking{owner.pendingCount === 1 ? '' : 's'}</div>
          </div>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          {isLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="animate-spin" size={18} /></div>
          ) : (
            <div className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
              <div className="rounded-2xl border border-primary/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-black uppercase text-[10px] text-muted-foreground">Arena</th>
                      <th className="text-left p-3 font-black uppercase text-[10px] text-muted-foreground">Booked</th>
                      <th className="text-left p-3 font-black uppercase text-[10px] text-muted-foreground">Owed</th>
                      <th className="text-left p-3 font-black uppercase text-[10px] text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {bookings.map(b => (
                      <tr key={b._id}>
                        <td className="p-3 font-bold">{bookingTurf(b)?.name || 'Arena'}</td>
                        <td className="p-3 text-muted-foreground">{formatSlotDate(new Date(b.createdAt))}</td>
                        <td className="p-3 font-black">₹{b.ownerAmount ?? 0}</td>
                        <td className="p-3 text-right"><MarkPaidDialog booking={b} onSettled={refreshAll} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationFooter page={page} pages={pages} total={total} onPageChange={setPage} itemLabel="pending" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PENDING_LIMIT = 20;
const CLAWBACKS_LIMIT = 20;
const HISTORY_LIMIT = 15;

export default function AdminPayoutsPage() {
  const { page: pendingPage, setPage: setPendingPage } = usePageQueryParam('pendingPage');
  const { page: clawbacksPage, setPage: setClawbacksPage } = usePageQueryParam('clawbacksPage');
  const { page: historyPage, setPage: setHistoryPage } = usePageQueryParam('historyPage');

  const { data: pendingData, isLoading: isPendingLoading, isError: isPendingError, refetch: refetchPending } = useQuery({
    queryKey: ['admin-payouts-pending', pendingPage],
    queryFn: () => apiGet<Paginated<PendingPayoutSummary>>(`/admin/payouts/pending?page=${pendingPage}&limit=${PENDING_LIMIT}`),
    placeholderData: keepPreviousData,
  });

  const { data: clawbacksData } = useQuery({
    queryKey: ['admin-payouts-clawbacks', clawbacksPage],
    queryFn: () => apiGet<Paginated<Booking>>(`/admin/payouts/clawbacks?page=${clawbacksPage}&limit=${CLAWBACKS_LIMIT}`),
    placeholderData: keepPreviousData,
  });

  const { data: historyData, isFetching: isHistoryFetching } = useQuery({
    queryKey: ['admin-payouts-history', historyPage],
    queryFn: () => apiGet<Paginated<Payout>>(`/admin/payouts/history?page=${historyPage}&limit=${HISTORY_LIMIT}`),
    placeholderData: keepPreviousData,
  });

  const owners = pendingData?.data?.items ?? [];
  const pendingOwnersTotal = pendingData?.data?.total ?? 0;
  const pendingOwnersPages = pendingData?.data?.pages ?? 1;
  const clawbacks = clawbacksData?.data?.items ?? [];
  const clawbacksTotal = clawbacksData?.data?.total ?? 0;
  const clawbacksPages = clawbacksData?.data?.pages ?? 1;
  const history = historyData?.data?.items ?? [];
  const historyTotal = historyData?.data?.total ?? 0;
  const historyPages = historyData?.data?.pages ?? 1;
  // The "Total Owed" tile intentionally sums only the current page of owners
  // — a running total across every owner would need its own aggregate
  // endpoint. Fine at the owner counts this platform expects, but worth
  // revisiting if the pending-payouts list itself outgrows one page often.
  const totalPending = owners.reduce((sum, o) => sum + o.pendingAmount, 0);

  if (isPendingLoading) return <SyncingIndicator label="Syncing Payout Data" />;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Wallet size={16} /></div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Platform Control</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Owner Payouts</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Settle what's owed to each owner after the platform's commission. Transfers happen outside the app — this just records them.
        </p>
      </div>

      {isPendingError ? (
        <QueryErrorState message="Couldn't load pending payouts." onRetry={() => refetchPending()} />
      ) : (
        <>
          <div className="glass-card rounded-[2.5rem] p-8 max-w-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Owed to Owners</div>
            <div className="text-3xl font-black tracking-tighter mt-1">₹{totalPending.toLocaleString('en-IN')}</div>
            <div className="text-[10px] font-bold text-muted-foreground mt-2">Across {owners.length} owner{owners.length === 1 ? '' : 's'}</div>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-black tracking-tighter px-2">Pending Settlement</h2>
            {owners.length === 0 ? (
              <div className="glass rounded-[3rem] p-16 text-center opacity-30">
                <Wallet size={40} className="mx-auto mb-2" />
                <p className="font-bold tracking-tight">Nothing pending — every owner is settled</p>
              </div>
            ) : (
              <div className="glass rounded-[3rem] overflow-hidden border-primary/10">
                {owners.map(o => <OwnerPendingRow key={o.ownerId} owner={o} />)}
              </div>
            )}
          </section>

          {clawbacks.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-black tracking-tighter px-2 text-destructive flex items-center gap-2">
                <AlertTriangle size={20} /> Needs Reconciliation
              </h2>
              <p className="text-sm text-muted-foreground px-2 -mt-2">
                These bookings were refunded to the customer after the owner had already been paid out — the owner now owes this amount back. Nothing here is automated; follow up directly.
              </p>
              <div className="glass rounded-[3rem] border-destructive/20 divide-y divide-destructive/10">
                {clawbacks.map(b => (
                  <div key={b._id} className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{bookingTurf(b)?.name || 'Arena'}</div>
                      <div className="text-[10px] text-muted-foreground">Paid out {b.paidOutAt ? formatSlotDate(new Date(b.paidOutAt)) : '—'}</div>
                    </div>
                    <div className="font-black text-destructive">₹{b.ownerAmount ?? 0}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-2xl font-black tracking-tighter px-2 flex items-center gap-2">
              <History size={20} /> Recent Payouts
            </h2>
            {history.length === 0 ? (
              <div className="glass rounded-[3rem] p-16 text-center opacity-30">
                <p className="font-bold tracking-tight">No payouts settled yet</p>
              </div>
            ) : (
              <div className="glass rounded-[3rem] overflow-hidden border-primary/10">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary/5 border-b border-primary/10">
                        <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Owner</th>
                        <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Amount</th>
                        <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Method</th>
                        <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Settled By</th>
                        <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-primary/5">
                      {history.map(p => (
                        <tr key={p._id}>
                          <td className="p-5 font-bold">{typeof p.ownerId === 'object' ? p.ownerId.name : p.ownerId}</td>
                          <td className="p-5 font-black">₹{p.amount}</td>
                          <td className="p-5 text-muted-foreground">{p.method}</td>
                          <td className="p-5 text-muted-foreground">{typeof p.paidBy === 'object' ? p.paidBy.name : p.paidBy}</td>
                          <td className="p-5 text-muted-foreground">{formatSlotDate(new Date(p.createdAt))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
