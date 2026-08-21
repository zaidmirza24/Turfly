import { Booking } from '@/types';
import { bookingTurf, bookingSlot } from '@/lib/booking';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * A receipt built entirely from data this booking already carries — there is
 * no separate invoicing system, so this is the honest ceiling of what "an
 * invoice" can mean here: proof of what was booked and what was charged, not
 * a tax document.
 */
export function BookingReceiptDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const turf = booking ? bookingTurf(booking) : undefined;
  const slot = booking ? bookingSlot(booking) : undefined;

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Booking Receipt</DialogTitle></DialogHeader>
        {booking && (
          <div id="booking-receipt" className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">#{booking.groupId || booking._id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Venue</span><span className="font-medium">{turf?.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{turf?.location ?? '—'}</span></div>
            {slot && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatSlotDate(slot.startTime)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}</span></div>
              </>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium">{booking.status}</span></div>
            <div className="flex justify-between border-t pt-3 font-bold"><span>Amount</span><span className="text-primary">₹{booking.amount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Booked on</span><span>{new Date(booking.createdAt).toLocaleDateString()}</span></div>

            <Button variant="outline" className="w-full mt-2 gap-2" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </Button>
            <Link
              to={`/help?booking=${booking.groupId || booking._id}`}
              className="text-xs text-muted-foreground hover:text-primary underline block text-center"
            >
              Need help with this booking?
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
