import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Users, ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { CustomerSummary, Paginated } from '@/types';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';
import { CustomerDetailDrawer } from './CustomerDetailDrawer';

const LIMIT = 20;

export default function AdminCustomersPage() {
  const [page, setPage] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-customers', page],
    queryFn: () => apiGet<Paginated<CustomerSummary>>(`/admin/customers?page=${page}&limit=${LIMIT}`),
  });

  const customers = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  if (isLoading) {
    return <SyncingIndicator label="Syncing Customers" />;
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
        <h1 className="text-4xl font-black tracking-tighter">Customers</h1>
        <p className="text-muted-foreground font-medium mt-1">Everyone who has ever booked on the platform, derived from booking history.</p>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load customers." onRetry={() => refetch()} />
      ) : customers.length === 0 ? (
        <div className="glass rounded-[3rem] p-16 text-center border-primary/10">
          <div className="flex flex-col items-center gap-4 opacity-20">
            <Users size={48} />
            <p className="text-lg font-black tracking-tighter text-foreground">No customers yet</p>
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {customers.map((c) => (
              <button
                key={c.userId}
                onClick={() => setSelectedCustomerId(c.userId)}
                className="w-full text-left glass rounded-[2rem] border-primary/10 p-5 shadow-xl shadow-black/5 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black tracking-tight truncate">{c.name} {c.isGuest && <span className="text-[10px] uppercase text-muted-foreground">(guest)</span>}</div>
                    <div className="text-[10px] font-bold text-muted-foreground truncate">{c.phone}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-lg tracking-tighter">₹{c.totalSpent.toLocaleString('en-IN')}</div>
                    <div className="text-[10px] font-bold text-muted-foreground">{c.totalBookings} bookings</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:block glass rounded-[3rem] overflow-hidden shadow-2xl shadow-black/5 border-primary/10">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary/5 border-b border-primary/10">
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Customer</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Total Bookings</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Cancelled</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Total Spent</th>
                    <th className="text-left p-6 font-black tracking-tighter text-muted-foreground uppercase text-[10px]">Last Booking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {customers.map((c) => (
                    <tr
                      key={c.userId}
                      onClick={() => setSelectedCustomerId(c.userId)}
                      className="group hover:bg-primary/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="p-6">
                        <div className="font-black tracking-tight">{c.name} {c.isGuest && <span className="text-[10px] uppercase text-muted-foreground font-bold">(guest)</span>}</div>
                        <div className="text-[10px] font-bold text-muted-foreground">{c.phone}</div>
                      </td>
                      <td className="p-6 font-bold">{c.totalBookings}</td>
                      <td className="p-6 font-bold text-muted-foreground">{c.cancelledCount}</td>
                      <td className="p-6 font-black text-lg tracking-tighter">₹{c.totalSpent.toLocaleString('en-IN')}</td>
                      <td className="p-6 text-muted-foreground text-xs">{new Date(c.lastBookingAt).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Page {page} of {pages} · {total} total</p>
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

      <CustomerDetailDrawer
        customerId={selectedCustomerId}
        open={!!selectedCustomerId}
        onOpenChange={(open) => { if (!open) setSelectedCustomerId(null); }}
      />
    </div>
  );
}
