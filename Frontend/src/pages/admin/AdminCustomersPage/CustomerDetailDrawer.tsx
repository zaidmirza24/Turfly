import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Booking, CustomerDetail } from '@/types';
import { bookingStartTime, bookingTurf } from '@/lib/booking';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { QueryErrorState } from '@/components/QueryErrorState';
import { Loader2, MapPin, CalendarDays } from 'lucide-react';
import { BookingDetailDrawer } from '../AdminBookingsPage/BookingDetailDrawer';

type Props = {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CustomerDetailDrawer({ customerId, open, onOpenChange }: Props) {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-customer-detail', customerId],
    queryFn: () => apiGet<CustomerDetail>(`/admin/customers/${customerId}`),
    enabled: open && !!customerId,
  });
  const detail = data?.data;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-black tracking-tighter">{detail?.customer.name || 'Customer'}</SheetTitle>
            <SheetDescription>{detail?.customer.phone || detail?.customer.email}</SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
          ) : isError ? (
            <QueryErrorState message="Couldn't load customer detail." onRetry={() => refetch()} />
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total Bookings" value={detail.stats.totalBookings} />
                <Stat label="Confirmed" value={detail.stats.confirmedCount} />
                <Stat label="Cancelled" value={detail.stats.cancelledCount} />
                <Stat label="Total Spent" value={`₹${detail.stats.totalSpent.toLocaleString('en-IN')}`} />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Booking History</h3>
                {detail.bookings.map((b) => {
                  const turf = bookingTurf(b);
                  const startTime = bookingStartTime(b);
                  return (
                    <button
                      key={b._id}
                      onClick={() => setSelectedBooking(b)}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <MapPin size={12} className="text-primary/60 shrink-0" />
                          <span className="font-bold text-sm truncate">{turf?.name || 'Standard Turf'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <CalendarDays size={12} />
                          {startTime ? `${formatSlotDate(startTime, { month: 'short', day: 'numeric' })} · ${formatSlotTime(startTime)}` : '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black">₹{b.amount}</div>
                        <BookingStatusBadge status={b.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <BookingDetailDrawer
        booking={selectedBooking}
        open={!!selectedBooking}
        onOpenChange={(o) => { if (!o) setSelectedBooking(null); }}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-xl bg-muted/50 border">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xl font-black tracking-tighter mt-1">{value}</div>
    </div>
  );
}
