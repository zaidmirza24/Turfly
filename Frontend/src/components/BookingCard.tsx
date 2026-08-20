import { Booking } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingCardProps {
  booking: Booking;
  onCancel?: (id: string) => void;
  showCancel?: boolean;
}

export function BookingCard({ booking, onCancel, showCancel }: BookingCardProps) {
  const turf = (booking as any).turfId;
  const turfName = turf?.name || booking.turfName || 'Turf';
  const startTimeStr = (booking.slotId as any)?.startTime || (booking as any).startTime;
  const startTime = startTimeStr ? new Date(startTimeStr) : null;
  const isPast = startTime ? startTime < new Date() : false;
  const id = booking._id || booking.id;

  const dateStr = startTime ? startTime.toLocaleDateString() : (booking as any).date || 'N/A';
  const timeStr = startTime ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{turfName}</h3>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1 capitalize">
            <span>{(booking as any).sport || 'Sports'}</span>
          </div>
        </div>
        <Badge
          variant={booking.status === 'CONFIRMED' || booking.status === 'confirmed' ? 'default' : booking.status === 'CANCELLED' || booking.status === 'cancelled' ? 'destructive' : 'secondary'}
          className={cn((booking.status === 'CONFIRMED' || booking.status === 'confirmed') && 'bg-primary')}
        >
          {booking.status.toUpperCase()}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar size={14} />
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock size={14} />
          <span>{timeStr}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t">
        <span className="font-bold text-lg">₹{booking.totalAmount || booking.amount}</span>
        {showCancel && (booking.status === 'CONFIRMED' || booking.status === 'confirmed') && !isPast && onCancel && (
          <Button variant="destructive" size="sm" onClick={() => onCancel(id)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
