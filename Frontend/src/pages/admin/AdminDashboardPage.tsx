import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { Users, MapPin, CalendarDays, DollarSign, Activity, ArrowRight, Percent, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { AdminStats, AuditLogEntry, Paginated } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { cn } from '@/lib/utils';
import { AuditLogRow } from './AuditLogRow';

export default function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => apiGet<AdminStats>('/admin/stats'),
  });

  const { data: activityData } = useQuery({
    queryKey: ['admin-audit-log', 'recent'],
    queryFn: () => apiGet<Paginated<AuditLogEntry>>('/admin/audit-log?limit=8'),
  });

  const stats = data?.data;
  const activity = activityData?.data?.items ?? [];

  const chartData = (stats?.dailySeries ?? []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    revenue: d.revenue,
  }));

  const cards = [
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'from-blue-500/20 to-blue-500/5 text-blue-500' },
    { label: 'Total Turfs', value: stats?.totalTurfs ?? 0, icon: MapPin, color: 'from-primary/20 to-primary/5 text-primary' },
    { label: 'Total Bookings', value: stats?.totalBookings ?? 0, icon: CalendarDays, color: 'from-amber-500/20 to-amber-500/5 text-amber-500' },
    { label: 'Total Revenue', value: `₹${(stats?.totalRevenue ?? 0).toLocaleString('en-IN')}`, icon: DollarSign, color: 'from-success/20 to-success/5 text-success' },
    { label: 'Commission Earned', value: `₹${(stats?.totalCommissionEarned ?? 0).toLocaleString('en-IN')}`, icon: Percent, color: 'from-primary/20 to-primary/5 text-primary' },
    { label: 'Owed to Owners', value: `₹${(stats?.totalOwedToOwners ?? 0).toLocaleString('en-IN')}`, icon: Wallet, color: 'from-warning/20 to-warning/5 text-warning' },
  ];

  if (isLoading) {
    return <SyncingIndicator label="Syncing Overview" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Activity size={16} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Admin Command Center</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Platform Overview</h1>
        <p className="text-muted-foreground font-medium mt-1">A top-level view of everything happening across the platform.</p>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load stats." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {cards.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card rounded-[2rem] p-5 md:p-8 group hover:border-primary/40 transition-all card-hover"
              >
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <div className={cn('p-3 md:p-4 rounded-2xl bg-gradient-to-br', s.color)}>
                    <s.icon size={20} />
                  </div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</div>
                <div className="text-2xl md:text-3xl font-black tracking-tighter mt-1">{s.value}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black tracking-tighter">Revenue Insights</h2>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Last 14 Days</span>
                </div>
              </div>

              <div className="glass-card rounded-[3rem] p-8 h-[350px] border-primary/10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAdminRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                        fontWeight: 900,
                      }}
                      itemStyle={{ color: 'hsl(var(--primary))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={4} fillOpacity={1} fill="url(#colorAdminRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black tracking-tighter">Activity</h2>
                <Link to="/admin/activity" className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-1.5 transition-all">
                  View all <ArrowRight size={12} />
                </Link>
              </div>

              <div className="glass-card rounded-[3rem] p-4 border-primary/10 max-h-[350px] overflow-y-auto custom-scrollbar space-y-1">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12 font-medium">No admin activity yet</p>
                ) : (
                  activity.map((entry) => <AuditLogRow key={entry._id} entry={entry} />)
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
