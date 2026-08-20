import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Filter, CalendarDays, User, MapPin, Activity } from 'lucide-react';
import { Booking } from '@/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function OwnerBookingsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: bookingsResponse, isLoading } = useQuery({
    queryKey: ['owner-bookings'],
    queryFn: () => api.get('/bookings/owner'),
  });

  const bookings = (bookingsResponse as any)?.data as Booking[] || [];

  const filtered = bookings.filter(b => {
    const matchesFilter = filter === 'all' || b.status.toLowerCase() === filter.toLowerCase();
    const user = (b as any).userId;
    const turf = (b as any).turfId;
    const matchesSearch = !search || 
      user?.name?.toLowerCase().includes(search.toLowerCase()) || 
      turf?.name?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase animate-pulse">Syncing Bookings</p>
      </div>
    );
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
        
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search customer or turf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-2xl bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-background outline-none font-bold transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 bg-primary/5 p-2 rounded-2xl border border-primary/10 w-fit">
        {['all', 'confirmed', 'cancelled'].map(s => (
          <Button 
            key={s} 
            variant="ghost" 
            size="sm" 
            onClick={() => setFilter(s)} 
            className={cn("capitalize h-9 px-6 rounded-xl font-bold transition-all", 
              filter === s ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
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
                      <div className="flex flex-col items-center gap-4 opacity-20">
                        <Filter size={64} />
                        <div className="space-y-1">
                          <p className="text-xl font-black tracking-tighter text-foreground">No bookings found</p>
                          <p className="text-sm font-medium">Try adjusting your search or filters</p>
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  filtered.map((b, i) => {
                    const user = (b as any).userId;
                    const turf = (b as any).turfId;
                    const startTimeStr = (b.slotId as any)?.startTime || (b as any).startTime;
                    const startTime = startTimeStr ? new Date(startTimeStr) : new Date();
                    
                    return (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: i * 0.05 }}
                        key={b._id || b.id} 
                        className="group hover:bg-primary/[0.02] transition-colors"
                      >
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User size={18} className="text-primary" />
                            </div>
                            <div>
                              <div className="font-black tracking-tight">{user?.name || 'Guest User'}</div>
                              <div className="text-[10px] font-bold text-muted-foreground">{user?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-primary/60" />
                            <div className="font-bold">{turf?.name || 'Standard Turf'}</div>
                          </div>
                          <div className="text-[10px] font-medium text-muted-foreground ml-6">{turf?.location}</div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2 mb-1">
                            <CalendarDays size={14} className="text-primary" />
                            <span className="font-black tracking-tight">{startTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-6">
                            {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="font-black text-lg tracking-tighter">₹{b.totalAmount || b.amount}</div>
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Paid via Wallet</div>
                        </td>
                        <td className="p-6">
                          <span className={cn(
                            "text-[9px] px-3 py-1.5 rounded-full font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm border",
                            b.status.toUpperCase() === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 
                            b.status.toUpperCase() === 'CANCELLED' ? 'bg-destructive/10 text-destructive border-destructive/20' : 
                            'bg-muted text-muted-foreground border-transparent'
                          )}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", 
                              b.status.toUpperCase() === 'CONFIRMED' ? "bg-emerald-500 animate-pulse" : 
                              b.status.toUpperCase() === 'CANCELLED' ? "bg-destructive" : "bg-muted-foreground"
                            )} />
                            {b.status}
                          </span>
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
    </div>
  );
}
