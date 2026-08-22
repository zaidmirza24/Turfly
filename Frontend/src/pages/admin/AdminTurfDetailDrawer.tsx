import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MapPin, User, Phone, Layers, DollarSign } from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { Turf, TurfDetail } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Props = {
  turf: Turf | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SLOT_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  LOCKED: 'Held',
  BOOKED: 'Booked',
  CLOSED: 'Closed',
  FULL: 'Marked full',
};

export function AdminTurfDetailDrawer({ turf, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-turf-detail', turf?._id],
    queryFn: () => apiGet<TurfDetail>(`/admin/turfs/${turf?._id}`),
    enabled: open && !!turf?._id,
  });
  const detail = data?.data;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/approve`),
    onSuccess: () => {
      toast.success('Turf approved');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-turf-detail'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to approve turf'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPatch<Turf>(`/admin/turfs/${id}/reject`),
    onSuccess: () => {
      toast.success('Turf is no longer listed publicly');
      queryClient.invalidateQueries({ queryKey: ['admin-turfs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-turf-detail'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to reject turf'),
  });

  if (!turf) return null;
  const isMutating = approveMutation.isPending || rejectMutation.isPending;
  const owner = detail?.turf.ownerId;
  const status = detail?.turf.approvalStatus ?? turf.approvalStatus ?? 'PENDING';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tighter">{turf.name}</SheetTitle>
          <SheetDescription>{turf.location}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="mt-6 space-y-6">
            <Badge
              variant={status === 'APPROVED' ? 'default' : status === 'PENDING' ? 'secondary' : 'destructive'}
              className="capitalize"
            >
              {status.toLowerCase()}
            </Badge>

            {detail?.turf.images && detail.turf.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                {detail.turf.images.slice(0, 4).map((src, i) => (
                  <img key={i} src={src} alt="" className="w-24 h-24 rounded-2xl object-cover shrink-0 border" />
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold">{owner?.name || 'Unknown owner'}</div>
                  <div className="text-sm text-muted-foreground truncate">{owner?.email}</div>
                  {owner?.phone && (
                    <a href={`tel:${owner.phone}`} className="text-sm text-primary hover:underline">{owner.phone}</a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold capitalize">{(turf.sportsType || []).join(', ')}</div>
                  <div className="text-sm text-muted-foreground">{turf.venueType || 'OUTDOOR'} · Capacity {turf.capacity ?? '—'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign size={16} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">₹{turf.pricePerHour}/hr</div>
                  <div className="text-sm text-muted-foreground">
                    Weekday ₹{turf.defaultWeekdayPrice ?? turf.pricePerHour} · Weekend ₹{turf.defaultWeekendPrice ?? turf.pricePerHour}
                  </div>
                </div>
              </div>

              {turf.amenities && turf.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {turf.amenities.map((a) => (
                    <Badge key={a} variant="outline" className="capitalize font-medium">{a}</Badge>
                  ))}
                </div>
              )}

              {detail?.slotSummary && (
                <div className="flex items-start gap-3">
                  <Layers size={16} className="text-primary mt-0.5 shrink-0" />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {Object.entries(detail.slotSummary).map(([key, count]) => (
                      <span key={key}><span className="font-bold text-foreground">{count}</span> {SLOT_LABELS[key] ?? key}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t flex gap-2">
              {status !== 'APPROVED' && (
                <Button className="flex-1" disabled={isMutating} onClick={() => approveMutation.mutate(turf._id)}>
                  {approveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Approve'}
                </Button>
              )}
              {status !== 'REJECTED' && (
                <Button
                  variant={status === 'APPROVED' ? 'outline' : 'destructive'}
                  className="flex-1"
                  disabled={isMutating}
                  onClick={() => rejectMutation.mutate(turf._id)}
                >
                  {rejectMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : status === 'APPROVED' ? 'Unlist' : 'Reject'}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
