import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, User, MapPin, CalendarDays, CreditCard, StickyNote, ShieldCheck } from 'lucide-react';
import { apiPatch } from '@/lib/api';
import { Booking, Payment } from '@/types';
import { bookingStartTime, bookingTurf, bookingUser } from '@/lib/booking';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';

type Props = {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Admin's own copy of the owner panel's drawer — same generic
// /bookings/:id/cancel|refund routes (already ADMIN-authorized), but
// invalidating the admin-scoped query keys rather than the owner ones.
const INVALIDATE_KEYS = ['admin-bookings', 'admin-customers', 'admin-customer-detail', 'admin-stats'];

export function BookingDetailDrawer({ booking, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const invalidateAll = () => INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) =>
      apiPatch<{ booking: Booking; refund: { refunded: boolean } }>(`/bookings/${bookingId}/cancel`, { reason: reason.trim() || undefined }),
    onSuccess: (res) => {
      toast.success(res.data.refund.refunded ? 'Booking cancelled — refund initiated' : 'Booking cancelled');
      setConfirmingCancel(false);
      setReason('');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to cancel booking'),
  });

  const refundMutation = useMutation({
    mutationFn: (bookingId: string) => apiPatch<Booking>(`/bookings/${bookingId}/refund`),
    onSuccess: () => {
      toast.success('Marked as refunded');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update refund status'),
  });

  if (!booking) return null;

  const customer = bookingUser(booking);
  const turf = bookingTurf(booking);
  const startTime = bookingStartTime(booking);
  const payment = typeof booking.paymentId === 'object' ? (booking.paymentId as Payment) : null;
  const isOnlinePayment = booking.paymentMethod === 'ONLINE' && !!booking.paymentId;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setConfirmingCancel(false); setReason(''); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tighter">Booking Detail</SheetTitle>
          <SheetDescription>Reference {booking._id.slice(-8).toUpperCase()}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <BookingStatusBadge status={booking.status} />
            {booking.status === 'CANCELLED' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {booking.refundStatus === 'REFUNDED' ? 'Refunded' :
                  booking.refundStatus === 'REFUND_PENDING' ? 'Refund pending' :
                  booking.refundStatus === 'REFUND_FAILED' ? 'Refund failed' :
                  booking.refundStatus === 'MARKED_REFUNDED' ? 'Refunded (recorded)' : 'Not refunded'}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <User size={16} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">{customer?.name || 'Guest User'}</div>
                <div className="text-sm text-muted-foreground truncate">{customer?.email}</div>
                {customer?.phone && (
                  <a href={`tel:${customer.phone}`} className="text-sm text-primary hover:underline">{customer.phone}</a>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">{turf?.name || 'Standard Turf'}</div>
                <div className="text-sm text-muted-foreground truncate">{turf?.location}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CalendarDays size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">{startTime ? formatSlotDate(startTime, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                <div className="text-sm text-muted-foreground">{startTime ? formatSlotTime(startTime) : ''}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CreditCard size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">₹{booking.amount}</div>
                <div className="text-sm text-muted-foreground">
                  {booking.paymentMethod === 'CASH' ? 'Cash (recorded by owner)' :
                    booking.paymentMethod === 'PENDING' ? 'Payment pending' :
                    payment ? `Online — ${payment.status === 'PAID' ? 'Paid' : payment.status}` : 'Online'}
                  {booking.createdBy === 'OWNER' && ' · Owner-created'}
                </div>
                {payment?.razorpayPaymentId && (
                  <div className="text-xs text-muted-foreground font-mono truncate">{payment.razorpayPaymentId}</div>
                )}
              </div>
            </div>

            {booking.notes && (
              <div className="flex items-start gap-3">
                <StickyNote size={16} className="text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{booking.notes}</p>
              </div>
            )}

            {booking.cancelledBy && booking.status === 'CANCELLED' && (
              <div className="flex items-start gap-3">
                <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">Cancelled by {booking.cancelledBy.toLowerCase()}</p>
              </div>
            )}
          </div>

          {booking.status === 'CONFIRMED' && (
            <div className="pt-4 border-t space-y-3">
              {confirmingCancel ? (
                <div className="space-y-3">
                  <Textarea
                    placeholder="Reason (optional) — recorded in the audit log"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setConfirmingCancel(false)}>Back</Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(booking._id)}
                    >
                      {cancelMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Confirm Cancel'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="destructive" className="w-full" onClick={() => setConfirmingCancel(true)}>
                  Cancel Booking
                </Button>
              )}
            </div>
          )}

          {booking.status === 'CANCELLED' && isOnlinePayment && (
            <div className="pt-4 border-t">
              <p className="text-[11px] text-muted-foreground text-center">
                {booking.refundStatus === 'REFUNDED'
                  ? `₹${booking.refundAmount ?? booking.amount} was refunded automatically to the customer's original payment method.`
                  : booking.refundStatus === 'REFUND_PENDING'
                  ? "A refund was automatically initiated and is being processed by Razorpay — this updates on its own once it's confirmed."
                  : booking.refundStatus === 'REFUND_FAILED'
                  ? 'The automatic refund failed — this needs manual follow-up in the Razorpay dashboard.'
                  : 'No refund was needed for this booking.'}
              </p>
            </div>
          )}

          {booking.status === 'CANCELLED' && !isOnlinePayment && booking.refundStatus !== 'MARKED_REFUNDED' && (
            <div className="pt-4 border-t space-y-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={refundMutation.isPending}
                onClick={() => refundMutation.mutate(booking._id)}
              >
                {refundMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Mark as Refunded'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Records that the booking was refunded outside the app — no payment is processed here.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
