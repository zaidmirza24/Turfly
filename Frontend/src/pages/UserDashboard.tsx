import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { BookingCard } from '@/components/BookingCard';
import { BookingReceiptDialog } from '@/components/BookingReceiptDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CalendarDays, User, Activity, ChevronRight, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Booking } from '@/types';
import { bookingStartTime } from '@/lib/booking';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { SyncingIndicator } from '@/components/SyncingIndicator';

export default function UserDashboard() {
  const { cancelBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);

  const { data: bookingsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => apiGet<Booking[]>('/bookings'),
    enabled: !!user,
  });

  const bookings = bookingsResponse?.data ?? [];

  const now = Date.now();
  const upcoming = bookings.filter(b => {
    const start = bookingStartTime(b);
    return b.status === 'CONFIRMED' && !!start && start.getTime() >= now;
  });

  // "Completed" — played and never cancelled. Kept separate from "Cancelled"
  // because they mean very different things to a customer glancing at their
  // history, even though both are, mechanically, "not upcoming".
  const completed = bookings.filter(b => {
    const start = bookingStartTime(b);
    return b.status === 'CONFIRMED' && !!start && start.getTime() < now;
  });

  const cancelled = bookings.filter(b => b.status === 'CANCELLED');

  const cancelTarget = bookings.find(b => b._id === cancelId);

  const handleCancel = async () => {
    if (cancelId && !isCancelling) {
      setIsCancelling(true);
      try {
        await cancelBooking(cancelId);
        toast.success("Booking cancelled — you weren't charged, so there's nothing to refund");
        queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to cancel booking');
      } finally {
        setIsCancelling(false);
        setCancelId(null);
      }
    }
  };

  if (isLoading) {
    return <SyncingIndicator label="Retrieving Tickets" />;
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-4xl text-center">
        <div className="border-2 border-dashed rounded-2xl border-destructive/20 bg-destructive/5 py-16">
          <AlertTriangle size={32} className="text-destructive/60 mx-auto mb-3" />
          <p className="font-medium text-destructive">Couldn't load your bookings</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Check your connection and try again.</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
            <RefreshCw size={14} /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-8 rounded-[2.5rem] border-border shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 gradient-primary opacity-50" />
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-[2rem] bg-primary/10 flex items-center justify-center border-2 border-primary/20 shadow-xl shadow-primary/5">
            <User size={32} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Member Account</span>
            </div>
            <h1 className="text-3xl font-black tracking-tighter">{user?.name}</h1>
            <p className="text-muted-foreground font-medium text-sm">{user?.email}</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="text-center px-6 border-r border-border">
            <div className="text-2xl font-black tracking-tighter text-foreground">{upcoming.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Upcoming</div>
          </div>
          <div className="text-center px-6 border-r border-border">
            <div className="text-2xl font-black tracking-tighter text-muted-foreground">{completed.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Completed</div>
          </div>
          <div className="text-center px-6">
            <div className="text-2xl font-black tracking-tighter text-muted-foreground">{cancelled.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Cancelled</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-8">
        <TabsList className="bg-primary/5 p-1.5 rounded-2xl border border-primary/10 h-14 w-fit flex-wrap">
          <TabsTrigger value="upcoming" className="h-full px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg shadow-primary/20">
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="completed" className="h-full px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Completed
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="h-full px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Cancelled
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="upcoming" className="mt-0 outline-none">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-6">
              {upcoming.length === 0 ? (
                <div className="text-center py-24 glass rounded-[3rem] border-dashed border-primary/10">
                  <CalendarDays size={48} className="mx-auto mb-4 opacity-10 text-primary" />
                  <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase">No upcoming bookings</p>
                  <Button variant="link" className="mt-2 text-primary font-bold" onClick={() => navigate('/turfs')}>Discover Arenas <ChevronRight size={14} /></Button>
                </div>
              ) : (
                upcoming.map(b => <BookingCard key={b._id} booking={b} showCancel onCancel={setCancelId} onViewReceipt={setReceiptBooking} />)
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="completed" className="mt-0 outline-none">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-6">
              {completed.length === 0 ? (
                <div className="text-center py-24 glass rounded-[3rem] border-dashed border-border opacity-50">
                  <Activity size={48} className="mx-auto mb-4 opacity-10" />
                  <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase">No completed bookings yet</p>
                </div>
              ) : (
                completed.map(b => <BookingCard key={b._id} booking={b} onViewReceipt={setReceiptBooking} />)
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="cancelled" className="mt-0 outline-none">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-6">
              {cancelled.length === 0 ? (
                <div className="text-center py-24 glass rounded-[3rem] border-dashed border-border opacity-50">
                  <XCircle size={48} className="mx-auto mb-4 opacity-10" />
                  <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase">No cancelled bookings</p>
                </div>
              ) : (
                cancelled.map(b => <BookingCard key={b._id} booking={b} onViewReceipt={setReceiptBooking} />)
              )}
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent className="rounded-[2.5rem] p-8 border-none glass-card max-w-sm">
          <AlertDialogHeader className="space-y-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-2xl flex items-center justify-center text-destructive mb-2">
              <Activity size={24} />
            </div>
            <AlertDialogTitle className="text-2xl font-black tracking-tighter">Cancel Slot?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-medium space-y-2">
              <span className="block">This releases your reserved time back to the venue and can't be undone. Free cancellation is only available up to 6 hours before the slot starts.</span>
              <span className="block text-xs">
                You paid ₹{cancelTarget?.amount ?? 0} for this slot — but since this platform doesn't process real payments yet, nothing was actually charged, so there's no refund to process either.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="rounded-xl font-bold h-12 border-border hover:bg-muted">Keep Slot</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isCancelling} className="rounded-xl h-12 font-black bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xl shadow-destructive/20">
              {isCancelling ? 'Cancelling…' : 'Confirm Cancellation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingReceiptDialog booking={receiptBooking} onClose={() => setReceiptBooking(null)} />
    </div>
  );
}
