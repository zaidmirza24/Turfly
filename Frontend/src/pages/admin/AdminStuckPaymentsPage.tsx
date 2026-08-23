import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { StuckPayment } from '@/types';
import { formatSlotDate } from '@/lib/dateKey';
import { Button } from '@/components/ui/button';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';

interface ReconcileResult {
  recovered?: unknown[];
  alreadyComplete?: boolean;
  bookingFailed?: boolean;
}

function StuckPaymentRow({ payment, onReconciled }: { payment: StuckPayment; onReconciled: () => void }) {
  const mutation = useMutation({
    mutationFn: () => apiPost<ReconcileResult>(`/admin/payments/${payment._id}/reconcile`),
    onSuccess: (res) => {
      const result = res.data;
      if (result.bookingFailed) {
        toast.success('Slot(s) could no longer be claimed — payment fully refunded instead');
      } else if (result.alreadyComplete) {
        toast.success('Already complete — nothing was actually missing');
      } else {
        toast.success(`Recovered ${result.recovered?.length ?? 0} booking(s)`);
      }
      onReconciled();
    },
    onError: (error: Error) => toast.error(error.message || 'Reconciliation failed'),
  });

  const missing = payment.slotIds.length - payment.bookingIds.length;

  return (
    <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="font-bold">Payment #{payment._id.slice(-8)}</div>
        <div className="text-[11px] text-muted-foreground">
          Paid {formatSlotDate(new Date(payment.paidAt))} · {payment.razorpayPaymentId || 'no Razorpay payment id'}
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-destructive mt-1">
          {missing} of {payment.slotIds.length} slot{payment.slotIds.length === 1 ? '' : 's'} never became a booking
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="font-black text-lg tracking-tighter">₹{payment.amount.toLocaleString('en-IN')}</div>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          Reconcile
        </Button>
      </div>
    </div>
  );
}

export default function AdminStuckPaymentsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-payments-stuck'],
    queryFn: () => apiGet<StuckPayment[]>('/admin/payments/stuck'),
    // Not a scheduler — this is a human periodically checking a support
    // surface, the same posture as everything else in this codebase that
    // doesn't have a background job (see ai-context.md). Refetch on focus
    // keeps it from going stale for an admin who leaves the tab open.
    refetchOnWindowFocus: true,
  });

  const payments = data?.data ?? [];

  if (isLoading) return <SyncingIndicator label="Checking for stuck payments" />;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-destructive/10 text-destructive"><AlertOctagon size={16} /></div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-destructive">Needs Attention</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Stuck Payments</h1>
        <p className="text-muted-foreground font-medium mt-1 max-w-2xl">
          Payments where Razorpay captured real money but booking creation never finished — a server crash or
          timeout partway through. Reconcile finishes booking whichever slots are still available, or fully refunds
          the payment if they've since been taken by someone else.
        </p>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load stuck payments." onRetry={() => refetch()} />
      ) : payments.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center opacity-30">
          <AlertOctagon size={40} className="mx-auto mb-2" />
          <p className="font-bold tracking-tight">Nothing stuck — every captured payment has its bookings</p>
        </div>
      ) : (
        <div className="glass rounded-[3rem] overflow-hidden border-destructive/20 divide-y divide-destructive/10">
          {payments.map((p) => (
            <StuckPaymentRow
              key={p._id}
              payment={p}
              onReconciled={() => queryClient.invalidateQueries({ queryKey: ['admin-payments-stuck'] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
