import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, User, MapPin, CalendarDays, CreditCard, StickyNote, ShieldCheck, Flag } from 'lucide-react';
import { apiPatch } from '@/lib/api';
import { Booking, Payment } from '@/types';
import { bookingEndTime, bookingStartTime, bookingTurf, bookingUser, isFinishedBooking } from '@/lib/booking';
import { formatSlotDate, formatSlotTimeRange } from '@/lib/dateKey';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { ComplaintDialog } from '@/components/ComplaintDialog';

type Props = {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Invalidated after every mutation here so every page that lists bookings
// (owner bookings, dashboard, customer list/detail) picks up the change —
// harmless no-ops for the ones not currently mounted.
const INVALIDATE_KEYS = ['owner-bookings', 'owner-bookings-dashboard', 'owner-customers', 'owner-customer-detail'];

export function BookingDetailDrawer({ booking, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const invalidateAll = () => INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  // A booking shown here may be a merged multi-hour reservation — cancel/refund
  // apply per underlying per-hour Booking document, so every action here fans
  // out over `bookingIds` (falling back to the single `_id` for a 1hr booking).
  const cancelMutation = useMutation({
    mutationFn: (bookingIds: string[]) =>
      Promise.all(
        bookingIds.map((id) =>
          apiPatch<{ booking: Booking }>(`/bookings/${id}/cancel`, { reason: reason.trim() || undefined })
        )
      ),
    onSuccess: () => {
      toast.success('Booking cancelled — the slot has been released');
      setConfirmingCancel(false);
      setReason('');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to cancel booking'),
  });

  const noShowMutation = useMutation({
    mutationFn: (bookingIds: string[]) => Promise.all(bookingIds.map((id) => apiPatch<Booking>(`/bookings/${id}/no-show`))),
    onSuccess: () => {
      toast.success('Recorded as a no-show');
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to record no-show'),
  });

  if (!booking) return null;

  const customer = bookingUser(booking);
  const turf = bookingTurf(booking);
  const startTime = bookingStartTime(booking);
  const endTime = bookingEndTime(booking);
  const bookingIds = booking.bookingIds ?? [booking._id];
  const payment = typeof booking.paymentId === 'object' ? (booking.paymentId as Payment) : null;
  const isOnlinePayment = booking.paymentMethod === 'ONLINE' && !!booking.paymentId;
  // A no-show can only be recorded once the slot has actually passed —
  // before that the customer hasn't failed to turn up, they just haven't
  // turned up yet. The server enforces the same rule.
  const hasFinished = isFinishedBooking(booking);

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setConfirmingCancel(false); setReason(''); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tighter">Booking Detail</SheetTitle>
          <SheetDescription>Reference {(booking.groupId ?? booking._id).slice(-8).toUpperCase()}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <BookingStatusBadge status={booking.status} />
            {booking.status === 'CANCELLED' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {booking.refundStatus === 'REFUNDED' ? 'Refunded' :
                  booking.refundStatus === 'REFUND_PENDING' ? 'Refund pending' :
                  booking.refundStatus === 'REFUND_FAILED' ? 'Refund failed' : 'Non-refundable'}
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
                <div className="text-sm text-muted-foreground">{startTime ? formatSlotTimeRange(startTime, endTime) : ''}</div>
                {bookingIds.length > 1 && (
                  <div className="text-xs text-muted-foreground">{bookingIds.length} linked hourly slots</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CreditCard size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">₹{booking.amount}</div>
                <div className="text-sm text-muted-foreground">
                  {booking.paymentMethod === 'CASH' ? 'Cash (recorded by you)' :
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

          <div className="pt-4 border-t">
            <ComplaintDialog
              bookingId={booking._id}
              turfId={turf?._id}
              trigger={<Button variant="ghost" size="sm" className="gap-1.5 w-full"><Flag size={14} /> Report an issue</Button>}
            />
          </div>

          {hasFinished && booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW' && (
            <div className="pt-4 border-t space-y-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={noShowMutation.isPending}
                onClick={() => noShowMutation.mutate(bookingIds)}
              >
                {noShowMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Mark as no-show'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                The customer never turned up. The slot stays used and the payment stays with you — this doesn't refund anything.
              </p>
            </div>
          )}

          {booking.status === 'CONFIRMED' && (
            <div className="pt-4 border-t space-y-3">
              {confirmingCancel ? (
                <div className="space-y-3">
                  <Textarea
                    placeholder="Reason (optional) — shown only to you"
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
                      onClick={() => cancelMutation.mutate(bookingIds)}
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
                  ? `₹${booking.refundAmount ?? booking.amount} was refunded to the customer from the Razorpay dashboard, and this booking was reconciled to match.`
                  : booking.refundStatus === 'REFUND_PENDING'
                  ? 'A refund is being processed by Razorpay — this updates on its own once confirmed.'
                  : booking.refundStatus === 'REFUND_FAILED'
                  ? 'A refund was attempted and failed — needs follow-up in the Razorpay dashboard.'
                  : 'Bookings are non-refundable, so no money was returned for this cancellation.'}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
