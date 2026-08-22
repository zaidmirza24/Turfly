import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, CalendarDays, User, MapPin, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { Booking, Paginated, Turf } from '@/types';
import { bookingStartTime, bookingTurf, bookingUser } from '@/lib/booking';
import { formatSlotDate, formatSlotTime, toDateKey } from '@/lib/dateKey';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { QueryErrorState } from '@/components/QueryErrorState';
import { BookingDetailDrawer } from './BookingDetailDrawer';
import { ManualBookingModal } from './ManualBookingModal';

const LIMIT = 20;

export default function OwnerBookingsPage() {
  const [status, setStatus] = useState('all');
  const [turfId, setTurfId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: turfsResponse } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => apiGet<Turf[]>('/turfs/my-turfs'),
  });
  const turfs = turfsResponse?.data ?? [];

  const filters = { status, turfId, from, to, page };
  const { data: bookingsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['owner-bookings', filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (status !== 'all') params.set('status', status.toUpperCase());
      if (turfId !== 'all') params.set('turfId', turfId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return apiGet<Paginated<Booking>>(`/bookings/owner?${params.toString()}`);
    },
  });

  const bookings = bookingsResponse?.data?.items ?? [];
  const total = bookingsResponse?.data?.total ?? 0;
  const pages = bookingsResponse?.data?.pages ?? 1;

  // Free-text search stays client-side over the current page only — a real
  // server-side search would need a text index this backend doesn't have yet.
  const q = search.trim().toLowerCase();
  const filtered = bookings.filter((b) => {
    if (!q) return true;
    return bookingUser(b)?.name?.toLowerCase().includes(q) || bookingTurf(b)?.name?.toLowerCase().includes(q);
  });

  const resetToPage1 = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  if (isLoading) {
    return <SyncingIndicator label="Syncing Bookings" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Activity size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Owner Command Center</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">Booking History</h1>
          <p className="text-muted-foreground font-medium mt-1">Full audit log of all your venue reservations.</p>
        </div>

        <div className="flex items-center gap-3">
          <ManualBookingModal turfs={turfs} />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative w-full lg:w-72 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search customer or turf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bookings by customer or turf"
            className="w-full h-12 pl-12 pr-4 rounded-2xl bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-background outline-none font-bold transition-all"
          />
        </div>

        <Select value={turfId} onValueChange={resetToPage1(setTurfId)}>
          <SelectTrigger className="w-full lg:w-48 h-12 rounded-2xl bg-primary/5 border-2 border-transparent"><SelectValue placeholder="All turfs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All turfs</SelectItem>
            {turfs.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => resetToPage1(setFrom)(e.target.value)} className="h-12 rounded-2xl bg-primary/5 border-2 border-transparent" aria-label="From date" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => resetToPage1(setTo)(e.target.value)} className="h-12 rounded-2xl bg-primary/5 border-2 border-transparent" aria-label="To date" />
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-primary/5 p-2 rounded-2xl border border-primary/10 w-fit">
        {['all', 'confirmed', 'cancelled'].map(s => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            onClick={() => resetToPage1(setStatus)(s)}
            className={cn("capitalize h-9 px-6 rounded-xl font-bold transition-all",
              status === s ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {s}
          </Button>
        ))}
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load bookings." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <EmptyState />
            ) : (
              filtered.map((b) => {
                const customer = bookingUser(b);
                const turf = bookingTurf(b);
                const startTime = bookingStartTime(b);
                return (
                  <div
                    key={b._id}
                    onClick={() => setSelectedBooking(b)}
                    className="glass rounded-[2rem] border-primary/10 p-5 shadow-xl shadow-black/5 space-y-4 cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <User size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-black tracking-tight truncate">{customer?.name || 'Guest User'}</div>
                          <div className="text-[10px] font-bold text-muted-foreground truncate">{customer?.email}</div>
                        </div>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin size={14} className="text-primary/60 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold truncate">{turf?.name || 'Standard Turf'}</div>
                        <div className="text-[10px] font-medium text-muted-foreground truncate">{turf?.location}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CalendarDays size={14} className="text-primary" />
                          <span className="font-black tracking-tight">
                            {startTime ? formatSlotDate(startTime, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </span>
                        </div>
                        <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-6">
                          {startTime ? formatSlotTime(startTime) : ''}
                        </div>
                      </div>
                      <div className="font-black text-lg tracking-tighter">₹{b.amount}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Customer Details</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Venue / Location</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Reservation</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Pricing</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  <AnimatePresence mode="popLayout">
                    {filtered.length === 0 ? (
                      <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td colSpan={5} className="p-32 text-center">
                          <EmptyState />
                        </td>
                      </motion.tr>
                    ) : (
                      filtered.map((b, i) => {
                        const customer = bookingUser(b);
                        const turf = bookingTurf(b);
                        const startTime = bookingStartTime(b);

                        return (
                          <motion.tr
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: i * 0.05 }}
                            key={b._id}
                            onClick={() => setSelectedBooking(b)}
                            className="group hover:bg-primary/[0.02] transition-colors cursor-pointer"
                          >
                            <td className="p-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User size={18} className="text-primary" />
                                </div>
                                <div>
                                  <div className="font-black tracking-tight">{customer?.name || 'Guest User'}</div>
                                  <div className="text-[10px] font-bold text-muted-foreground">{customer?.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-6 max-w-[16rem]">
                              <div className="flex items-center gap-2 min-w-0">
                                <MapPin size={14} className="text-primary/60 shrink-0" />
                                <div className="font-bold truncate">{turf?.name || 'Standard Turf'}</div>
                              </div>
                              <div className="text-[10px] font-medium text-muted-foreground ml-6 truncate">{turf?.location}</div>
                            </td>
                            <td className="p-6">
                              <div className="flex items-center gap-2 mb-1">
                                <CalendarDays size={14} className="text-primary" />
                                <span className="font-black tracking-tight">
                                  {startTime ? formatSlotDate(startTime, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                </span>
                              </div>
                              <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-6">
                                {startTime ? formatSlotTime(startTime) : ''}
                              </div>
                            </td>
                            <td className="p-6">
                              <div className="font-black text-lg tracking-tighter">₹{b.amount}</div>
                            </td>
                            <td className="p-6">
                              <BookingStatusBadge status={b.status} />
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pages} · {total} total
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <BookingDetailDrawer
        booking={selectedBooking}
        open={!!selectedBooking}
        onOpenChange={(open) => { if (!open) setSelectedBooking(null); }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
      <div className="flex flex-col items-center gap-4 opacity-20">
        <Filter size={48} />
        <div className="space-y-1">
          <p className="text-lg font-black tracking-tighter text-foreground">No bookings found</p>
          <p className="text-sm font-medium">Try adjusting your search or filters</p>
        </div>
      </div>
    </div>
  );
}
