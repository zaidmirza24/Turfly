import { Booking } from '@/types';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { bookingStartTime, bookingTurf } from '@/lib/booking';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';

interface BookingCardProps {
  booking: Booking;
  onCancel?: (id: string) => void;
  showCancel?: boolean;
}

// Mirrors the server's cancellation cutoff (booking.service.js,
// CANCELLATION_CUTOFF_MS) — kept in sync manually since the two run in
// different codebases. This only controls whether the button is shown; the
// server is what actually enforces the rule.
const CANCELLATION_CUTOFF_MS = 6 * 60 * 60 * 1000;

export function BookingCard({ booking, onCancel, showCancel }: BookingCardProps) {
  const turf = bookingTurf(booking);
  const startTime = bookingStartTime(booking);
  const isPast = startTime ? startTime < new Date() : false;
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
      <div className="flex items-center justify-between mt-3 pt-3 border-t">
        <span className="font-bold text-lg">₹{booking.amount}</span>
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
  );
}
