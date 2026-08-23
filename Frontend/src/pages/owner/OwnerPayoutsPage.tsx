import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Booking, Paginated } from '@/types';
import { bookingTurf } from '@/lib/booking';
import { formatSlotDate } from '@/lib/dateKey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, IndianRupee, Loader2, AlertTriangle, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';

/**
 * Owner-facing view of the commission split (see Backend's
 * booking.model.js commissionAmount/ownerAmount/payoutStatus): what's owed,
 * what's already been paid out, and where the admin should send it. No money
 * moves from this page — settlement is admin-only (booking.service.js
 * markBookingPaidOut), this is read + the payout-details form only.
 */
export default function OwnerPayoutsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<'UPI' | 'BANK'>(user?.payoutDetails?.method ?? 'UPI');
  const [upiId, setUpiId] = useState(user?.payoutDetails?.upiId ?? '');
  const [bankAccountHolder, setBankAccountHolder] = useState(user?.payoutDetails?.bankAccountHolder ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(user?.payoutDetails?.bankAccountNumber ?? '');
  const [bankIfsc, setBankIfsc] = useState(user?.payoutDetails?.bankIfsc ?? '');

  // No status/paymentStatus filter here deliberately: payoutStatus already
  // tells the whole story (a CLAWBACK_OWED booking has status CANCELLED —
  // it was refunded — but still needs to show up here), so filtering by
  // booking status would hide exactly the row that most needs attention.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['owner-bookings-payouts'],
    queryFn: () => apiGet<Paginated<Booking>>('/bookings/owner?limit=500'),
  });

  const bookings = data?.data?.items ?? [];
  const pending = useMemo(() => bookings.filter(b => b.payoutStatus === 'PENDING'), [bookings]);
  const paid = useMemo(() => bookings.filter(b => b.payoutStatus === 'PAID'), [bookings]);
  const clawbacks = useMemo(() => bookings.filter(b => b.payoutStatus === 'CLAWBACK_OWED'), [bookings]);

  const pendingAmount = pending.reduce((sum, b) => sum + (b.ownerAmount ?? 0), 0);
  const paidAmount = paid.reduce((sum, b) => sum + (b.ownerAmount ?? 0), 0);
  const clawbackAmount = clawbacks.reduce((sum, b) => sum + (b.ownerAmount ?? 0), 0);

  const payoutMutation = useMutation({
    mutationFn: () =>
      apiPatch('/users/me/payout-details',
        method === 'UPI'
          ? { method, upiId }
          : { method, bankAccountHolder, bankAccountNumber, bankIfsc }
      ),
    onSuccess: (res) => {
      toast.success('Payout details saved');
      localStorage.setItem('user', JSON.stringify({ ...user, ...res.data }));
      window.location.reload();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save payout details'),
  });

  if (isLoading) return <SyncingIndicator label="Syncing Payout Data" />;
  if (isError) return <QueryErrorState message="Couldn't load your payout data." onRetry={() => refetch()} />;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Wallet size={16} /></div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Earnings</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Payouts</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Your share after the platform's commission — settled by the admin outside the app.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-card rounded-[2.5rem] p-8">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pending Payout</div>
          <div className="text-3xl font-black tracking-tighter mt-1">₹{pendingAmount.toLocaleString('en-IN')}</div>
          <div className="text-[10px] font-bold text-muted-foreground mt-2">{pending.length} booking{pending.length === 1 ? '' : 's'} awaiting settlement</div>
        </div>
        <div className="glass-card rounded-[2.5rem] p-8">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Paid To Date</div>
          <div className="text-3xl font-black tracking-tighter mt-1">₹{paidAmount.toLocaleString('en-IN')}</div>
          <div className="text-[10px] font-bold text-muted-foreground mt-2">{paid.length} booking{paid.length === 1 ? '' : 's'} settled</div>
        </div>
        {clawbacks.length > 0 && (
          <div className="glass-card rounded-[2.5rem] p-8 border-destructive/30">
            <div className="text-[10px] font-black uppercase tracking-widest text-destructive flex items-center gap-1">
              <AlertTriangle size={12} /> Owed Back
            </div>
            <div className="text-3xl font-black tracking-tighter mt-1 text-destructive">₹{clawbackAmount.toLocaleString('en-IN')}</div>
            <div className="text-[10px] font-bold text-muted-foreground mt-2">
              {clawbacks.length} booking{clawbacks.length === 1 ? '' : 's'} refunded after you were paid — the admin will follow up
            </div>
          </div>
        )}
      </div>

      <section className="glass rounded-[2.5rem] p-8 space-y-5 border-primary/10">
        <div className="flex items-center gap-2">
          <Landmark size={18} className="text-primary" />
          <h2 className="text-xl font-black tracking-tighter">Where should we send it?</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          This is informational only — settlement happens outside the app, so make sure it's accurate.
        </p>

        <div className="max-w-sm">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as 'UPI' | 'BANK')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="BANK">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {method === 'UPI' ? (
          <div className="max-w-sm">
            <Label htmlFor="upi-id">UPI ID</Label>
            <Input id="upi-id" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@bank" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <div className="sm:col-span-2">
              <Label htmlFor="bank-holder">Account Holder Name</Label>
              <Input id="bank-holder" value={bankAccountHolder} onChange={e => setBankAccountHolder(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bank-number">Account Number</Label>
              <Input id="bank-number" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bank-ifsc">IFSC Code</Label>
              <Input id="bank-ifsc" value={bankIfsc} onChange={e => setBankIfsc(e.target.value.toUpperCase())} placeholder="ABCD0123456" />
            </div>
          </div>
        )}

        <Button onClick={() => payoutMutation.mutate()} disabled={payoutMutation.isPending}>
          {payoutMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          Save Payout Details
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tighter px-2">Pending Settlement</h2>
        {pending.length === 0 ? (
          <div className="glass rounded-[3rem] p-16 text-center opacity-30">
            <IndianRupee size={40} className="mx-auto mb-2" />
            <p className="font-bold tracking-tight">Nothing pending — you're all caught up</p>
          </div>
        ) : (
          <div className="glass rounded-[3rem] overflow-hidden border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Arena</th>
                    <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Booked</th>
                    <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Gross</th>
                    <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Commission</th>
                    <th className="text-left p-5 font-black uppercase text-[10px] text-muted-foreground">Your Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {pending.map(b => (
                    <tr key={b._id}>
                      <td className="p-5 font-bold">{bookingTurf(b)?.name || 'Arena'}</td>
                      <td className="p-5 text-muted-foreground">{formatSlotDate(new Date(b.createdAt))}</td>
                      <td className="p-5">₹{b.amount}</td>
                      <td className="p-5 text-muted-foreground">₹{b.commissionAmount ?? 0}</td>
                      <td className="p-5 font-black">₹{b.ownerAmount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
