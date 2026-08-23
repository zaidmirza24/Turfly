import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { SyncingIndicator } from '@/components/SyncingIndicator';
import { QueryErrorState } from '@/components/QueryErrorState';

interface PlatformSettings {
  commissionRate: number;
  updatedAt: string;
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [ratePercent, setRatePercent] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiGet<PlatformSettings>('/admin/settings'),
  });

  const settings = data?.data;

  useEffect(() => {
    if (settings) setRatePercent(String(Math.round(settings.commissionRate * 10000) / 100));
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (commissionRate: number) => apiPatch<PlatformSettings>('/admin/settings/commission', { commissionRate }),
    onSuccess: () => {
      toast.success('Commission rate updated');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update commission rate'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const percent = Number(ratePercent);
    if (Number.isNaN(percent) || percent < 0 || percent >= 100) {
      toast.error('Enter a percentage between 0 and 99.99');
      return;
    }
    mutation.mutate(percent / 100);
  };

  if (isLoading) {
    return <SyncingIndicator label="Syncing Settings" />;
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Settings size={16} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Admin Command Center</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter">Platform Settings</h1>
        <p className="text-muted-foreground font-medium mt-1">Configure platform-wide policies.</p>
      </div>

      {isError ? (
        <QueryErrorState message="Couldn't load settings." onRetry={() => refetch()} />
      ) : (
        <div className="glass rounded-[3rem] p-8 shadow-2xl shadow-black/5 border-primary/10 max-w-lg">
          <div className="flex items-center gap-2 mb-6">
            <Percent size={18} className="text-primary" />
            <h2 className="text-lg font-black tracking-tight">Platform Commission</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            The percentage of every online booking's amount the platform keeps; the rest is owed to the turf owner.
            Changing this only affects bookings confirmed after the change — it never re-prices an already-confirmed booking.
          </p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="commissionRate">Commission rate (%)</Label>
              <Input
                id="commissionRate"
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
