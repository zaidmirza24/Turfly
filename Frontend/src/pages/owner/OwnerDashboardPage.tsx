import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import api from '@/lib/api';
import { DollarSign, CalendarDays, TrendingUp, MapPin, ChevronRight, Activity } from 'lucide-react';
import { Booking, Turf } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { data: turfsResponse, isLoading: isLoadingTurfs } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => api.get('/turfs/my-turfs'),
  });

  const { data: bookingsResponse, isLoading: isLoadingBookings } = useQuery({
    queryKey: ['owner-bookings'],
    queryFn: () => api.get('/bookings/owner'),
  });

  const turfs = (turfsResponse as any)?.data as Turf[] || [];
  const bookings = (bookingsResponse as any)?.data as Booking[] || [];

  const revenue = bookings
    .filter(b => b.status.toUpperCase() === 'CONFIRMED')
    .reduce((s, b) => s + (b.totalAmount || b.amount || 0), 0);

  const upcoming = bookings.filter(b => {
    const startTimeStr = (b.slotId as any)?.startTime || (b as any).startTime;
    const isUpcoming = startTimeStr ? new Date(startTimeStr) >= new Date() : false;
    return b.status.toUpperCase() === 'CONFIRMED' && isUpcoming;
  });

  const stats = [
    { label: 'Total Bookings', value: bookings.length, icon: CalendarDays, trend: '+12%', color: 'from-blue-500/15 to-blue-600/15 text-blue-600' },
    { label: 'Total Revenue', value: `₹${revenue.toLocaleString()}`, icon: DollarSign, trend: '+8.4%', color: 'from-success/15 to-success/25 text-success' },
    { label: 'Upcoming', value: upcoming.length, icon: TrendingUp, trend: '+2', color: 'from-warning/15 to-warning/25 text-warning' },
    { label: 'Active Turfs', value: turfs.filter(t => t.isActive).length, icon: MapPin, trend: 'Stable', color: 'from-purple-500/15 to-purple-600/15 text-purple-600' },
  ];

  // Prepare chart data
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => {
      const dayBookings = bookings.filter(b => {
        const bDate = ((b.slotId as any)?.startTime || (b as any).startTime || '').split('T')[0];
        return bDate === date && b.status.toUpperCase() === 'CONFIRMED';
      });
      const amount = dayBookings.reduce((s, b) => s + (b.totalAmount || b.amount || 0), 0);
      return {
        date: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
        revenue: amount
      };
    });
  }, [bookings]);

  if (isLoadingTurfs || isLoadingBookings) {
    return <SyncingIndicator label="Syncing Arena Data" double />;
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
          <h1 className="text-4xl font-black tracking-tighter">Arena Overview</h1>
          <p className="text-muted-foreground font-medium mt-1">Monitor performance and manage your sports facilities.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={s.label} 
            className="glass-card rounded-[2.5rem] p-8 group hover:border-primary/40 transition-all card-hover"
          >
            <div className="flex items-center justify-between mb-6">
              <div className={cn("p-4 rounded-2xl bg-gradient-to-br", s.color)}>
                <s.icon size={24} />
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</div>
                <div className="text-3xl font-black tracking-tighter mt-1">{s.value}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-4 border-t border-primary/5">
              <span className="text-[10px] font-black text-success bg-success/10 px-2 py-0.5 rounded-full">{s.trend}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Since last week</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-black tracking-tighter">Revenue Insights</h2>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Daily Performance</span>
            </div>
          </div>
          
          <div className="glass-card rounded-[3rem] p-8 h-[350px] border-primary/10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 900 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 900 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem',
                    fontSize: '12px',
                    fontWeight: 900
                  }}
                  itemStyle={{ color: 'hsl(var(--primary))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-black tracking-tighter">Live Status</h2>
            <span className="flex h-2 w-2 rounded-full bg-success animate-ping" />
          </div>

          <div className="glass rounded-[2.5rem] p-6 space-y-4">
             <div className="space-y-4">
               {upcoming.length > 0 ? (
                 upcoming.slice(0, 3).map((b, i) => (
                   <div key={b._id} className="flex items-center gap-4 p-4 rounded-2xl bg-muted border group hover:border-primary/20 transition-all">
                     <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center text-primary font-black">
                        <span className="text-[10px] leading-none uppercase">{new Date((b.slotId as any)?.startTime || (b as any).startTime).toLocaleDateString(undefined, {month: 'short'})}</span>
                        <span className="text-lg leading-none">{new Date((b.slotId as any)?.startTime || (b as any).startTime).getDate()}</span>
                     </div>
                     <div>
                       <div className="font-bold text-sm">Upcoming Match</div>
                       <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{(b as any).turfId?.name}</div>
                     </div>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-10 opacity-30">
                    <Activity size={40} className="mx-auto mb-2" />
                    <p className="text-xs font-black uppercase tracking-widest">Waiting for action</p>
                 </div>
               )}
             </div>

             <Button onClick={() => navigate('/owner/bookings')} className="w-full rounded-2xl h-12 bg-muted hover:bg-accent text-xs font-black uppercase tracking-widest border">
                Full Activity Log
             </Button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-black tracking-tighter">Recent Bookings</h2>
            <Button onClick={() => navigate('/owner/bookings')} variant="ghost" className="text-primary font-bold gap-1 hover:bg-primary/5 rounded-full">
              View All <ChevronRight size={16} />
            </Button>
          </div>
          
          <div className="glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Arena</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Customer / Slot</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Amount</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                          <CalendarDays size={48} />
                          <p className="font-bold tracking-tight">No bookings received yet</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    bookings.slice(0, 6).map((b, i) => {
                      const turf = (b as any).turfId;
                      const user = (b as any).userId;
                      const startTimeStr = (b.slotId as any)?.startTime || (b as any).startTime;
                      const startTime = startTimeStr ? new Date(startTimeStr) : new Date();
                      
                      return (
                        <motion.tr 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + (i * 0.05) }}
                          key={b._id || b.id} 
                          className="group hover:bg-primary/[0.02] transition-colors"
                        >
                          <td className="p-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary">
                                {turf?.name?.charAt(0) || 'A'}
                              </div>
                              <div className="font-black tracking-tight">{turf?.name || 'Arena'}</div>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="font-bold">{user?.name || 'Customer'}</div>
                            <div className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                              {startTime.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} • {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="p-6 font-black text-lg tracking-tighter text-foreground/80">₹{b.totalAmount || b.amount}</td>
                          <td className="p-6">
                            <BookingStatusBadge status={b.status} />
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-black tracking-tighter px-2">Popular Venues</h2>
          <div className="space-y-4">
            {turfs.slice(0, 3).map((t, i) => (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + (i * 0.1) }}
                key={t._id} 
                className="glass p-5 rounded-[2rem] border-primary/10 flex items-center gap-4 group cursor-pointer hover:border-primary/30 transition-all shadow-xl shadow-black/5"
              >
                <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-black/10">
                  <img src={t.images?.[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018'} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                </div>
                <div className="flex-1">
                  <div className="font-black tracking-tight group-hover:text-primary transition-colors">{t.name}</div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    <MapPin size={10} className="text-primary" /> {t.location}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-primary tracking-widest uppercase">Price</div>
                  <div className="text-lg font-black tracking-tighter">₹{t.pricePerHour}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
