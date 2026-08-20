import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { BookingCard } from '@/components/BookingCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CalendarDays, Loader2, User, Activity, ChevronRight } from 'lucide-react';
import { Booking } from '@/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function UserDashboard() {
  const { cancelBooking } = useBooking();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: bookingsResponse, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api.get('/bookings'),
    enabled: !!user,
  });

  const bookings = (bookingsResponse as any)?.data as Booking[] || [];

  const upcoming = bookings.filter(b => {
    const status = b.status.toUpperCase();
    const startTime = (b.slotId as any)?.startTime || (b as any).startTime;
    const isUpcoming = startTime ? new Date(startTime) >= new Date() : false;
    return status === 'CONFIRMED' && isUpcoming;
  });

  const past = bookings.filter(b => {
    const status = b.status.toUpperCase();
    const startTime = (b.slotId as any)?.startTime || (b as any).startTime;
    const isPast = startTime ? new Date(startTime) < new Date() : false;
    return status === 'CANCELLED' || isPast;
  });

  const handleCancel = async () => {
    if (cancelId) {
      try {
        await cancelBooking(cancelId);
        toast.success('Booking cancelled successfully');
        queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      } catch (err: any) {
        toast.error(err.message || 'Failed to cancel booking');
      } finally {
        setCancelId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase animate-pulse">Retrieving Tickets</p>
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
          <div className="text-center px-6">
            <div className="text-2xl font-black tracking-tighter text-muted-foreground">{past.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Past</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-8">
        <TabsList className="bg-primary/5 p-1.5 rounded-2xl border border-primary/10 h-14 w-fit">
          <TabsTrigger value="upcoming" className="h-full px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg shadow-primary/20">
            Active Plays
          </TabsTrigger>
          <TabsTrigger value="past" className="h-full px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            History
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="upcoming" className="mt-0 outline-none">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-6">
              {upcoming.length === 0 ? (
                <div className="text-center py-24 glass rounded-[3rem] border-dashed border-primary/10">
                  <CalendarDays size={48} className="mx-auto mb-4 opacity-10 text-primary" />
                  <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase">No active bookings found</p>
                  <Button variant="link" className="mt-2 text-primary font-bold" onClick={() => navigate('/turfs')}>Discover Arenas <ChevronRight size={14} /></Button>
                </div>
              ) : (
                upcoming.map(b => <BookingCard key={b._id || b.id} booking={b} showCancel onCancel={setCancelId} />)
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="past" className="mt-0 outline-none">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-6">
              {past.length === 0 ? (
                <div className="text-center py-24 glass rounded-[3rem] border-dashed border-border opacity-50">
                  <Activity size={48} className="mx-auto mb-4 opacity-10" />
                  <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase">No past history recorded</p>
                </div>
              ) : (
                past.map(b => <BookingCard key={b._id || b.id} booking={b} />)
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
            <AlertDialogDescription className="text-muted-foreground font-medium">
              This action releases your reserved time back to the arena. Refund policies may apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="rounded-xl font-bold h-12 border-border hover:bg-muted">Keep Slot</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="rounded-xl h-12 font-black bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xl shadow-destructive/20">Confirm Cancellation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
