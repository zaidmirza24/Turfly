import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Users, MapPin, CalendarDays, DollarSign } from 'lucide-react';
import { TableSkeleton } from '@/components/Skeletons';

interface AdminStats {
  totalUsers: number;
  totalTurfs: number;
  totalBookings: number;
  totalRevenue: number;
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => apiGet<AdminStats>('/admin/stats'),
  });

  const stats = data?.data;

  const cards = [
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users },
    { label: 'Total Turfs', value: stats?.totalTurfs ?? 0, icon: MapPin },
    { label: 'Total Bookings', value: stats?.totalBookings ?? 0, icon: CalendarDays },
    { label: 'Total Revenue', value: `₹${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Overview</h1>
      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(s => (
            <div key={s.label} className="border rounded-xl p-4 bg-card">
              <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">{s.label}</span><s.icon size={18} className="text-primary" /></div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
