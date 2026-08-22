import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { BookingSlotPicker } from '@/components/booking/BookingSlotPicker';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { useSlotAvailability } from '@/hooks/useSlotAvailability';
import { useBooking } from '@/contexts/BookingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Wifi, Car, Droplets, Shield, ChevronLeft, Calendar, Loader2, Zap, Phone, Users, Building2, Heart, BadgeCheck } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { cn } from '@/lib/utils';
import { TimeSlot, Turf } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as MonthCalendar } from '@/components/ui/calendar';
import { toDateKey } from '@/lib/dateKey';
import { resolveImageUrl, TURF_PLACEHOLDER_IMAGE } from '@/lib/imageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { recordTurfView } from '@/lib/recentlyViewed';
import { getCachedPosition, distanceKm, formatDistance } from '@/lib/geo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ReviewsSection } from '@/components/ReviewsSection';
import { startingPricePerHour } from '@/lib/turfPricing';
import { formatDuration } from '@/lib/duration';

const amenityIcons: Record<string, React.ReactNode> = {
  'Parking': <Car size={16} />,
  'Drinking Water': <Droplets size={16} />,
  'First Aid': <Shield size={16} />,
  'Air Conditioning': <Wifi size={16} />,
};

export default function TurfDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedSlots, selectSlots, clearSelection, keepSelectionFor } = useBooking();
  const [pickerResetKey, setPickerResetKey] = useState(0);
  const { user, isAuthenticated } = useAuth();
  // Only customers can hold a booking (POST /api/bookings is USER-only), so
  // an owner or admin browsing the site gets an explanation up front instead
  // of a 403 at the payment step.
  const canBook = !isAuthenticated || user?.role === 'USER';
  const [selectedImage, setSelectedImage] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const { favoriteIds, toggleFavorite, isCustomer } = useFavorites();

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const dateStr = toDateKey(selectedDate);

  const { data: turfResponse, isLoading: isLoadingTurf, error: turfError } = useQuery({
    queryKey: ['turf', id],
    queryFn: () => apiGet<Turf>(`/turfs/${id}`),
    enabled: !!id,
  });

  const turf = turfResponse?.data;

  useEffect(() => {
    if (turf?._id) recordTurfView(turf._id);
  }, [turf?._id]);

  // BookingCard's "Review" action links to /turfs/:id#reviews — a client-side
  // route change doesn't trigger the browser's native hash-scroll, so once
  // the section is actually in the DOM (turf loaded), scroll to it ourselves.
  useEffect(() => {
    if (turf && window.location.hash === '#reviews') {
      document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turf]);

  const userLocation = getCachedPosition();
  const distanceLabel = userLocation && turf?.geo?.coordinates
    ? formatDistance(distanceKm(userLocation, { lat: turf.geo.coordinates[1], lng: turf.geo.coordinates[0] }))
    : null;

  const { slotsForDay } = useSlotAvailability(id, dateStr);

  // Powers the calendar's availability dots — one range fetch per visible
  // month rather than one request per day, so paging the calendar doesn't
  // fan out into 30+ requests.
  const [visibleMonth, setVisibleMonth] = useState(today);
  const monthStart = toDateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1));
  const monthEnd = toDateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0));
  const { data: monthSlotsResponse } = useQuery({
    queryKey: ['slots-month', id, monthStart, monthEnd],
    queryFn: () => apiGet<TimeSlot[]>(`/slots?turfId=${id}&startDate=${monthStart}&endDate=${monthEnd}`),
    enabled: !!id,
  });
  const datesWithAvailability = new Set(
    (monthSlotsResponse?.data ?? [])
      .filter(s => s.status === 'AVAILABLE' && new Date(s.startTime).getTime() > Date.now())
      .map(s => toDateKey(new Date(s.startTime)))
  );

  // Slot selection lives in a provider shared by every turf page. Landing on
  // a different turf must drop a selection made elsewhere, or the sidebar
  // would total up — and the checkout would try to book — another venue's
  // slots under this venue's name.
  useEffect(() => {
    if (id) keepSelectionFor(id);
  }, [id, keepSelectionFor]);

  // A selection is date-specific (it's a fixed set of half-hour slots on one
  // day) — picking a different date without dropping it would let the sidebar
  // keep totaling up, and the checkout keep offering to book, a time range on
  // a day the customer isn't even looking at anymore.
  useEffect(() => {
    clearSelection();
    setPickerResetKey(k => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);

  const handleChangeSelection = () => {
    clearSelection();
    setPickerResetKey(k => k + 1);
  };

  const handleProceed = () => {
    if (selectedSlots.length > 0) navigate(`/booking/${turf._id}`);
  };

  if (isLoadingTurf) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (turfError || !turf) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Turf not found</h1>
        <Button className="mt-4" onClick={() => navigate('/turfs')}>Browse Turfs</Button>
      </div>
    );
  }

  const sports = turf.sportsType || [];
  const images = turf.images?.length
    ? turf.images.map(url => resolveImageUrl(url) as string)
    : [TURF_PLACEHOLDER_IMAGE];
  const pricePerHour = startingPricePerHour(turf);
  const isFavorite = favoriteIds.has(turf._id);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl pb-28 lg:pb-6">
      <Button variant="ghost" size="sm" className="gap-1 mb-6 hover:bg-primary/10" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} /> Back to Search
      </Button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
      >
        <div
          className="md:col-span-2 aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl bg-muted relative touch-pan-y"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null || images.length < 2) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            // 40px threshold keeps an ordinary vertical scroll (which still
            // drifts a little horizontally) from being misread as a swipe.
            if (Math.abs(delta) > 40) {
              setSelectedImage(prev => {
                const next = delta < 0 ? prev + 1 : prev - 1;
                return (next + images.length) % images.length;
              });
            }
            touchStartX.current = null;
          }}
        >
          <img
            src={images[selectedImage] ?? images[0]}
            alt={`${turf.name} — photo ${selectedImage + 1} of ${images.length}`}
            className="w-full h-full object-cover"
          />
          {isCustomer && (
            <button
              type="button"
              onClick={() => toggleFavorite(turf._id)}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className="absolute top-4 right-4 w-11 h-11 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform"
            >
              <Heart size={20} className={cn(isFavorite ? 'fill-destructive text-destructive' : 'text-foreground')} />
            </button>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
              {images.map((_, i) => (
                <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i === selectedImage ? 'bg-white' : 'bg-white/40')} />
              ))}
            </div>
          )}
        </div>
        {/* The thumbnail strip is pointless with a single photo. */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 md:grid-cols-1 gap-3">
            {images.slice(0, 4).map((img, i) => (
              <button
                key={img}
                type="button"
                onClick={() => setSelectedImage(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === selectedImage}
                className={cn('rounded-2xl overflow-hidden border-4 transition-all aspect-video shadow-md bg-muted',
                  i === selectedImage ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105')}>
                <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-12">
          <section>
            <div className="flex flex-wrap gap-2 mb-4">
              {sports.map(s => <Badge key={s} variant="secondary" className="capitalize px-3 py-1 rounded-full">{s}</Badge>)}
              {turf.isActive && <Badge className="bg-success hover:bg-success/90 rounded-full">Open Now</Badge>}
              <Badge variant="outline" className="rounded-full gap-1 border-primary/30 text-primary" title="Reviewed and approved by our team before going live">
                <BadgeCheck size={12} /> Verified Venue
              </Badge>
              {turf.venueType && (
                <Badge variant="outline" className="rounded-full gap-1">
                  <Building2 size={12} /> {turf.venueType === 'BOTH' ? 'Indoor & Outdoor' : turf.venueType.charAt(0) + turf.venueType.slice(1).toLowerCase()}
                </Badge>
              )}
              {turf.capacity && (
                <Badge variant="outline" className="rounded-full gap-1">
                  <Users size={12} /> Up to {turf.capacity} players
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">{turf.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-primary" />
                <span className="text-lg">{turf.location}</span>
              </div>
              {distanceLabel && <span className="text-sm font-bold text-primary">{distanceLabel}</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {turf.is24x7
                ? 'Open 24/7'
                : `Open ${String(turf.openHour ?? 0).padStart(2, '0')}:00 – ${String(turf.closeHour ?? 23).padStart(2, '0')}:00`}
              {turf.contactPhone && (
                <>
                  {' · '}
                  <a href={`tel:${turf.contactPhone}`} className="inline-flex items-center gap-1 hover:text-primary">
                    <Phone size={13} /> {turf.contactPhone}
                  </a>
                </>
              )}
            </p>
          </section>

          {turf.geo?.coordinates && (
            <section className="rounded-3xl overflow-hidden border h-64">
              <iframe
                title={`Map showing ${turf.name}`}
                className="w-full h-full"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${turf.geo.coordinates[0] - 0.01}%2C${turf.geo.coordinates[1] - 0.01}%2C${turf.geo.coordinates[0] + 0.01}%2C${turf.geo.coordinates[1] + 0.01}&layer=mapnik&marker=${turf.geo.coordinates[1]}%2C${turf.geo.coordinates[0]}`}
              />
            </section>
          )}

          <section className="bg-muted/30 p-8 rounded-3xl">
            <h2 className="text-xl font-bold mb-4">About the Arena</h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              {turf.description || 'Premium sports facility equipped with professional-grade turf, excellent lighting, and world-class amenities. Perfect for casual matches or tournament play.'}
            </p>
          </section>

          <section className={cn((turf.amenities ?? []).length === 0 && 'hidden')}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <Shield size={24} className="text-primary" /> Available Amenities
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(turf.amenities ?? []).map(a => (
                <div key={a} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border text-center card-hover">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    {amenityIcons[a] || <Shield size={18} />}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">{a}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(!turf.rules && 'hidden')}>
            <h2 className="text-xl font-bold mb-4">House Rules</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{turf.rules}</p>
          </section>

          <section className={cn((turf.faqs ?? []).length === 0 && 'hidden')}>
            <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible>
              {(turf.faqs ?? []).map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left font-semibold">{f.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Cancellation Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Free cancellation up to 6 hours before your slot starts, from My Bookings. Once inside that window, or after the slot has started, it can no longer be cancelled.
            </p>
          </section>

          <ReviewsSection
            turfId={turf._id}
            isOwnerOfTurf={user?.role === 'OWNER' && (typeof turf.ownerId === 'object' ? turf.ownerId._id : turf.ownerId) === user._id}
          />

          <section id="booking" className="scroll-mt-24 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Calendar size={24} className="text-primary" /> Select Your Date
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/*
                Slots (order-1) render before the calendar (order-2) below
                `md` — the calendar is a full month grid, and a customer on a
                phone previously had to scroll past all of it just to see
                today's slot availability and price. Above `md` the grid's
                two columns put them back side by side in the original
                calendar-then-slots reading order.
              */}
              <div className="glass rounded-[2.5rem] p-6 shadow-2xl space-y-4 order-2 md:order-1">
                <div className="flex gap-2">
                  <Button
                    variant={toDateKey(selectedDate) === toDateKey(today) ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full font-bold"
                    onClick={() => setSelectedDate(today)}
                  >
                    Today
                  </Button>
                  <Button
                    variant={toDateKey(selectedDate) === toDateKey(new Date(today.getTime() + 86400000)) ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full font-bold"
                    onClick={() => setSelectedDate(new Date(today.getTime() + 86400000))}
                  >
                    Tomorrow
                  </Button>
                </div>
                <MonthCalendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  onMonthChange={setVisibleMonth}
                  // Mirrors booking.service.js's MAX_ADVANCE_BOOKING_MS (30 days) —
                  // kept in sync manually since the two run in different codebases.
                  disabled={(date) =>
                    date < new Date(new Date().setHours(0, 0, 0, 0)) ||
                    date > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                  }
                  modifiers={{ hasAvailability: (date) => datesWithAvailability.has(toDateKey(date)) }}
                  modifiersClassNames={{
                    hasAvailability: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-success",
                  }}
                  className="w-full"
                />
                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" /> Dates with open slots
                </p>
              </div>

              <div className="space-y-4 order-1 md:order-2">
                <div className="flex items-center justify-between bg-primary/10 p-4 rounded-2xl border border-primary/20 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm font-black tracking-tight">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <Badge variant="outline" className="font-black border-primary/30 text-primary">
                    {slotsForDay.filter(s => s.status === 'AVAILABLE' && new Date(s.startTime).getTime() > Date.now()).length} Slots
                  </Badge>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={dateStr}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar"
                  >
                    {id && (
                      <BookingSlotPicker
                        key={pickerResetKey}
                        turfId={id}
                        dateStr={dateStr}
                        onSelectionChange={(slots) => selectSlots(slots ?? [])}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            <div className="glass p-5 sm:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden border-primary/10">
              <div className="absolute top-0 left-0 w-full h-1.5 gradient-primary" />
              
              {selectedSlots.length === 0 ? (
                <div className="text-center mb-8 pt-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Starting From</div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-black text-primary tracking-tighter">₹{pricePerHour}</span>
                    <span className="text-muted-foreground font-medium">/hr</span>
                  </div>
                </div>
              ) : (
                <div className="text-center mb-8 pt-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                    {formatDuration(selectedSlots.length * 30)} Selected
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-black text-primary tracking-tighter">₹{totalPrice}</span>
                  </div>
                </div>
              )}

              {selectedSlots.length > 0 ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <BookingSummary
                    slots={[...selectedSlots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())}
                    onChange={handleChangeSelection}
                  />

                  {!canBook && (
                    <p className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 rounded-2xl p-3">
                      You're signed in as {user?.role === 'OWNER' ? 'a turf owner' : 'an admin'}. Bookings can only be made from a player account.
                    </p>
                  )}
                  <Button
                    disabled={!canBook}
                    className="w-full h-16 rounded-2xl text-base sm:text-xl font-black gradient-primary shadow-xl shadow-primary/30 hover:scale-[1.02] transition-transform whitespace-normal px-3"
                    onClick={handleProceed}
                  >
                    {isAuthenticated ? 'Confirm & Pay' : 'Log in to book'}
                  </Button>
                </motion.div>
              ) : (
                <div className="text-center py-8 space-y-6">
                  <div className="p-6 rounded-[2rem] bg-muted/30 border-2 border-dashed border-muted-foreground/10 flex flex-col items-center gap-3">
                    <Calendar className="text-muted-foreground/20 w-10 h-10" />
                    <p className="text-muted-foreground text-sm font-bold max-w-[150px]">Pick a slot to see total price</p>
                  </div>
                  <Button variant="outline" className="w-full h-14 rounded-2xl border-2 font-bold hover:bg-primary/5 transition-colors" onClick={() => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' })}>
                    Check Availability
                  </Button>
                </div>
              )}
            </div>
            
            <div className="p-6 rounded-3xl bg-muted/50 border text-muted-foreground">
              <div className="flex gap-3">
                <Zap size={20} className="shrink-0 mt-0.5 text-primary" />
                <div className="text-xs font-medium leading-relaxed">
                  <strong className="text-foreground">Instant confirmation</strong> — your slot is held the moment you pay, and you can cancel any time before it starts.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        On mobile/tablet (<lg) the booking sidebar sits below all the page
        content instead of beside it, so without this bar a customer has to
        scroll past About/Amenities/the calendar every time before they can
        act on price/selection. Mirrors it without duplicating booking logic.
      */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-primary/10 shadow-2xl px-4 pt-3 flex items-center justify-between gap-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {selectedSlots.length === 0 ? (
          <>
            <div className="shrink-0">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Starting From</div>
              <div className="text-xl font-black text-primary tracking-tighter">₹{pricePerHour}<span className="text-xs text-muted-foreground font-medium">/hr</span></div>
            </div>
            <Button className="rounded-2xl font-black h-12 px-6 whitespace-normal" onClick={() => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' })}>
              Check Availability
            </Button>
          </>
        ) : (
          <>
            <div className="shrink-0">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                {formatDuration(selectedSlots.length * 30)}
              </div>
              <div className="text-xl font-black text-primary tracking-tighter">₹{totalPrice}</div>
            </div>
            <Button
              disabled={!canBook}
              className="flex-1 min-w-0 h-12 rounded-2xl font-black gradient-primary shadow-lg shadow-primary/30 whitespace-normal px-3 text-sm sm:text-base"
              onClick={handleProceed}
            >
              {isAuthenticated ? 'Confirm & Pay' : 'Log in to book'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
