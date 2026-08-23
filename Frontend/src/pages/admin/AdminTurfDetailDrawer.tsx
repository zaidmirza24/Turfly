import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, User, Layers, DollarSign, Clock, Star, CalendarCheck, FileText, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Turf, TurfDetail } from '@/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { resolveImageUrl, TURF_PLACEHOLDER_IMAGE } from '@/lib/imageUrl';
import { cn } from '@/lib/utils';
import { useAdminTurfApproval } from './useAdminTurfApproval';

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
  const { data, isLoading } = useQuery({
    queryKey: ['admin-turf-detail', turf?._id],
    queryFn: () => apiGet<TurfDetail>(`/admin/turfs/${turf?._id}`),
    enabled: open && !!turf?._id,
  });
  const detail = data?.data;

  const { approveMutation, rejectMutation, isMutating } = useAdminTurfApproval();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!turf) return null;
  const owner = detail?.turf.ownerId;
  const status = detail?.turf.approvalStatus ?? turf.approvalStatus ?? 'PENDING';
  const detailTurf = detail?.turf;
  const images = (detailTurf?.images ?? []).map((src) => resolveImageUrl(src, 'gallery') ?? src);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tighter">{turf.name}</SheetTitle>
          <SheetDescription>{turf.location}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={status === 'APPROVED' ? 'default' : status === 'PENDING' ? 'secondary' : 'destructive'}
                className="capitalize"
              >
                {status.toLowerCase()}
              </Badge>
              {!!detailTurf?.reviewCount && (
                <Badge variant="outline" className="gap-1">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {(detailTurf.avgRating ?? 0).toFixed(1)} ({detailTurf.reviewCount})
                </Badge>
              )}
              {!!detailTurf?.bookingCount && (
                <Badge variant="outline" className="gap-1">
                  <CalendarCheck size={12} /> {detailTurf.bookingCount} bookings
                </Badge>
              )}
            </div>

            {images.length > 0 ? (
              <div>
                <div
                  className="aspect-video w-full rounded-2xl overflow-hidden bg-muted border cursor-pointer"
                  onClick={() => setLightboxIndex(0)}
                >
                  <img src={images[0]} alt="" className="w-full h-full object-cover" />
                </div>
                {images.length > 1 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {images.map((src, i) => (
                      <button key={i} type="button" onClick={() => setLightboxIndex(i)} className="shrink-0">
                        <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover border hover:opacity-80 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-muted border flex items-center justify-center text-sm text-muted-foreground">
                No photos uploaded
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
                <Clock size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold">
                    {detailTurf?.is24x7
                      ? 'Open 24/7'
                      : `Open ${String(detailTurf?.openHour ?? 0).padStart(2, '0')}:00 – ${String(detailTurf?.closeHour ?? 23).padStart(2, '0')}:00`}
                  </div>
                  {detailTurf?.contactPhone && (
                    <a href={`tel:${detailTurf.contactPhone}`} className="text-sm text-primary hover:underline">
                      Contact: {detailTurf.contactPhone}
                    </a>
                  )}
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

            {detailTurf?.description && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <FileText size={14} className="text-primary" /> Description
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{detailTurf.description}</p>
              </div>
            )}

            {detailTurf?.rules && (
              <div className="space-y-1.5">
                <div className="text-sm font-bold">House Rules</div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{detailTurf.rules}</p>
              </div>
            )}

            {!!detailTurf?.faqs?.length && (
              <div className="space-y-1.5">
                <div className="text-sm font-bold">FAQs</div>
                <Accordion type="single" collapsible>
                  {detailTurf.faqs.map((f, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="text-left text-sm font-semibold">{f.question}</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {detailTurf?.geo?.coordinates && (
              <div className="space-y-1.5">
                <div className="text-sm font-bold">Location</div>
                <div className="rounded-2xl overflow-hidden border h-48">
                  <iframe
                    title={`Map showing ${turf.name}`}
                    className="w-full h-full"
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${detailTurf.geo.coordinates[0] - 0.01}%2C${detailTurf.geo.coordinates[1] - 0.01}%2C${detailTurf.geo.coordinates[0] + 0.01}%2C${detailTurf.geo.coordinates[1] + 0.01}&layer=mapnik&marker=${detailTurf.geo.coordinates[1]}%2C${detailTurf.geo.coordinates[0]}`}
                  />
                </div>
              </div>
            )}

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

      <DialogPrimitive.Root open={lightboxIndex !== null} onOpenChange={(v) => !v && setLightboxIndex(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/95" />
          <DialogPrimitive.Content className="fixed inset-0 z-[70] flex flex-col outline-none" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">{turf.name} — photo {lightboxIndex !== null ? lightboxIndex + 1 : ''}</DialogPrimitive.Title>
            <div className="flex items-center justify-between px-4 sm:px-8 py-4 text-white">
              <span className="text-sm font-bold tabular-nums opacity-80">
                {lightboxIndex !== null ? `${lightboxIndex + 1} / ${images.length}` : ''}
              </span>
              <DialogPrimitive.Close className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                <X size={22} />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
            <div className="relative flex-1 flex items-center justify-center px-2 sm:px-16 pb-6 min-h-0">
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))}
                  aria-label="Previous photo"
                  className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition-colors"
                >
                  <ChevronLeft size={26} />
                </button>
              )}
              {lightboxIndex !== null && (
                <img
                  src={images[lightboxIndex]}
                  alt={`${turf.name} — photo ${lightboxIndex + 1} of ${images.length}`}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl"
                  onError={(e) => { if (e.currentTarget.src !== TURF_PLACEHOLDER_IMAGE) e.currentTarget.src = TURF_PLACEHOLDER_IMAGE; }}
                />
              )}
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((i) => (i === null ? i : (i + 1) % images.length))}
                  aria-label="Next photo"
                  className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition-colors"
                >
                  <ChevronRight size={26} />
                </button>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 sm:px-8 pb-6 custom-scrollbar">
                {images.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className={cn(
                      'shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all',
                      i === lightboxIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80',
                    )}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </Sheet>
  );
}
