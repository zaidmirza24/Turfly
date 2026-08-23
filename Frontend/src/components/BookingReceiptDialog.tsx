import { Booking, Payment } from '@/types';
import { bookingTurf, bookingStartTime, bookingEndTime } from '@/lib/booking';
import { formatSlotDate, formatSlotTimeRange } from '@/lib/dateKey';
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
  const startTime = booking ? bookingStartTime(booking) : null;
  const endTime = booking ? bookingEndTime(booking) : null;
  const payment = booking && typeof booking.paymentId === 'object' ? (booking.paymentId as Payment) : null;

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Booking Receipt</DialogTitle></DialogHeader>
        {booking && (
          <div id="booking-receipt" className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Reference</span><span className="font-mono truncate min-w-0">#{booking.groupId || booking._id}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Venue</span><span className="font-medium truncate min-w-0">{turf?.name ?? '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Location</span><span className="truncate min-w-0">{turf?.location ?? '—'}</span></div>
            {startTime && (
              <>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Date</span><span>{formatSlotDate(startTime)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Time</span><span className="text-right">{formatSlotTimeRange(startTime, endTime)}</span></div>
              </>
            )}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="font-medium">{booking.status}</span></div>
            <div className="flex justify-between gap-3 border-t pt-3 font-bold"><span>Amount</span><span className="text-primary">₹{booking.amount}</span></div>
            {payment && (
              <>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Currency</span><span>{payment.currency}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Payment ref</span><span className="font-mono truncate min-w-0 text-xs">{payment.razorpayPaymentId ?? '—'}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payment status</span><span className="font-medium">{payment.status === 'PAID' ? 'Paid' : payment.status}</span></div>
                {payment.paidAt && (
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Paid on</span><span>{new Date(payment.paidAt).toLocaleString()}</span></div>
                )}
              </>
            )}
            {booking.refundStatus && booking.refundStatus !== 'NONE' && (
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Refund</span><span className="font-medium">{booking.refundStatus === 'REFUNDED' ? `₹${booking.refundAmount ?? booking.amount} refunded` : booking.refundStatus.replace(/_/g, ' ').toLowerCase()}</span></div>
            )}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Booked on</span><span>{new Date(booking.createdAt).toLocaleDateString()}</span></div>

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
