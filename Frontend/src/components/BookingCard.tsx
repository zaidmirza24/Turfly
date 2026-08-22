import { Booking } from '@/types';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { Calendar, Clock, MapPin, Receipt, RotateCcw, Star } from 'lucide-react';
import { bookingStartTime, bookingTurf } from '@/lib/booking';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { useNavigate } from 'react-router-dom';

interface BookingCardProps {
  booking: Booking;
  onCancel?: (id: string) => void;
  onViewReceipt?: (booking: Booking) => void;
  showCancel?: boolean;
}

// Mirrors the server's cancellation cutoff (booking.service.js,
// CANCELLATION_CUTOFF_MS) — kept in sync manually since the two run in
// different codebases. This only controls whether the button is shown; the
// server is what actually enforces the rule.
const CANCELLATION_CUTOFF_MS = 6 * 60 * 60 * 1000;

const refundCopy = (booking: Booking): string => {
  switch (booking.refundStatus) {
    case 'REFUNDED':
      return `Cancelled — ₹${booking.refundAmount ?? booking.amount} was refunded to your original payment method.`;
    case 'REFUND_PENDING':
      return 'Cancelled — your refund is being processed and typically lands in 5-7 business days.';
    case 'REFUND_FAILED':
      return "Cancelled — we couldn't process your refund automatically. Please contact support.";
    case 'MARKED_REFUNDED':
      return 'Cancelled — the venue has recorded this as refunded.';
    default:
      return booking.paymentMethod === 'ONLINE'
        ? 'Cancelled.'
        : "Cancelled — no online charge was made for this booking, so there's nothing to refund.";
  }
};

export function BookingCard({ booking, onCancel, onViewReceipt, showCancel }: BookingCardProps) {
  const navigate = useNavigate();
  const turf = bookingTurf(booking);
  const startTime = bookingStartTime(booking);
  const isPast = startTime ? startTime < new Date() : false;
  const isCompleted = booking.status === 'CONFIRMED' && isPast;
  const isPastCancellationCutoff = startTime
    ? startTime.getTime() - Date.now() < CANCELLATION_CUTOFF_MS
    : false;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{turf?.name || 'Turf'}</h3>
          {turf?.location && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1">
              <MapPin size={14} aria-hidden="true" />
              <span className="truncate">{turf.location}</span>
            </div>
          )}
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar size={14} aria-hidden="true" />
          <span>{startTime ? formatSlotDate(startTime, { weekday: 'short', month: 'short', day: 'numeric' }) : 'N/A'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock size={14} aria-hidden="true" />
          <span>{startTime ? formatSlotTime(startTime) : 'N/A'}</span>
        </div>
      </div>

      {booking.status === 'CANCELLED' && (
        <p className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2">
          {refundCopy(booking)}
        </p>
      )}

      <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap mt-3 pt-3 border-t">
        <span className="font-bold text-lg">₹{booking.amount}</span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onViewReceipt && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onViewReceipt(booking)}>
              <Receipt size={14} /> Receipt
            </Button>
          )}
          {isCompleted && turf?._id && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate(`/turfs/${turf._id}#reviews`)}>
              <Star size={14} /> Review
            </Button>
          )}
          {(isCompleted || booking.status === 'CANCELLED') && turf?._id && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/turfs/${turf._id}`)}>
              <RotateCcw size={14} /> Book Again
            </Button>
          )}
          {showCancel && booking.status === 'CONFIRMED' && !isPast && onCancel && (
            isPastCancellationCutoff ? (
              <span className="text-xs text-muted-foreground">Too close to start time to cancel</span>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => onCancel(booking._id)}>
                Cancel
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
