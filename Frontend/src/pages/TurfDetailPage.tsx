import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { SlotSelector } from '@/components/SlotSelector';
import { useBooking } from '@/contexts/BookingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Wifi, Car, Droplets, Shield, ChevronLeft, Calendar, Loader2, Zap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimeSlot, Turf } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as MonthCalendar } from '@/components/ui/calendar';
import { toDateKey, getISTDay, formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { resolveImageUrl, TURF_PLACEHOLDER_IMAGE } from '@/lib/imageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const MAX_SLOTS_PER_BOOKING = 10;

const amenityIcons: Record<string, React.ReactNode> = {
  'Parking': <Car size={16} />,
  'Drinking Water': <Droplets size={16} />,
  'First Aid': <Shield size={16} />,
  'Air Conditioning': <Wifi size={16} />,
};

export default function TurfDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toggleSlot, selectedSlots, clearSelection, keepSelectionFor } = useBooking();
  const { user, isAuthenticated } = useAuth();
  // Only customers can hold a booking (POST /api/bookings is USER-only), so
  // an owner or admin browsing the site gets an explanation up front instead
  // of a 403 at the payment step.
  const canBook = !isAuthenticated || user?.role === 'USER';
  const [selectedImage, setSelectedImage] = useState(0);

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const dateStr = toDateKey(selectedDate);

  const { data: turfResponse, isLoading: isLoadingTurf, error: turfError } = useQuery({
    queryKey: ['turf', id],
    queryFn: () => apiGet<Turf>(`/turfs/${id}`),
    enabled: !!id,
  });

  const turf = turfResponse?.data;

  const { data: slotsResponse, isLoading: isLoadingSlots } = useQuery({
    queryKey: ['slots', id, dateStr],
    queryFn: () => apiGet<TimeSlot[]>(`/slots?turfId=${id}&date=${dateStr}`),
    enabled: !!id && !!dateStr,
  });

  const slots = slotsResponse?.data ?? [];

  // Slot selection lives in a provider shared by every turf page. Landing on
  // a different turf must drop a selection made elsewhere, or the sidebar
  // would total up — and the checkout would try to book — another venue's
  // slots under this venue's name.
  useEffect(() => {
    if (id) keepSelectionFor(id);
  }, [id, keepSelectionFor]);

  const selectedSlotIds = selectedSlots.map(s => s._id);
  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);

  const handleSlotToggle = (slot: TimeSlot) => {
    const alreadySelected = selectedSlotIds.includes(slot._id);
    if (!alreadySelected && selectedSlots.length >= MAX_SLOTS_PER_BOOKING) {
      toast.error(`You can select up to ${MAX_SLOTS_PER_BOOKING} slots at a time`);
      return;
    }
    toggleSlot(slot);
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
  const pricePerHour = turf.pricePerHour || 500;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <Button variant="ghost" size="sm" className="gap-1 mb-6 hover:bg-primary/10" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} /> Back to Search
      </Button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
      >
        <div className="md:col-span-2 aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl bg-muted">
          <img
            src={images[selectedImage] ?? images[0]}
            alt={`${turf.name} — photo ${selectedImage + 1} of ${images.length}`}
            className="w-full h-full object-cover"
          />
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
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">{turf.name}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin size={18} className="text-primary" /> 
              <span className="text-lg">{turf.location}</span>
            </div>
          </section>

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

          <section id="booking" className="scroll-mt-24 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Calendar size={24} className="text-primary" /> Select Your Date
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div className="glass rounded-[2.5rem] p-6 shadow-2xl">
                <MonthCalendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                  className="w-full"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between bg-primary/10 p-4 rounded-2xl border border-primary/20 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm font-black tracking-tight">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <Badge variant="outline" className="font-black border-primary/30 text-primary">{slots.filter(s => s.status === 'AVAILABLE' && new Date(s.startTime).getTime() > Date.now()).length} Slots</Badge>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={dateStr}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar"
                  >
                    {isLoadingSlots ? (
                      <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>
                    ) : (
                      <SlotSelector slots={slots} selectedSlotIds={selectedSlotIds} onToggle={handleSlotToggle} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            <div className="glass p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden border-primary/10">
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
                    {selectedSlots.length} Slot{selectedSlots.length > 1 ? 's' : ''} Selected
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-black text-primary tracking-tighter">₹{totalPrice}</span>
                  </div>
                </div>
              )}

              {selectedSlots.length > 0 ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="bg-primary/5 border border-primary/20 rounded-[2rem] p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {selectedSlots
                      .slice()
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map(slot => {
                        const istDay = getISTDay(slot.startTime);
                        const isWeekend = istDay === 0 || istDay === 6;
                        return (
                          <div key={slot._id} className="flex justify-between items-center p-3 rounded-xl bg-card/60">
                            <div>
                              <div className="font-black text-sm tracking-tight flex items-center gap-1.5">
                                {formatSlotDate(slot.startTime)}
                                {' · '}
                                {formatSlotTime(slot.startTime)}
                                {isWeekend && <Sparkles size={11} className="text-success" aria-label="Weekend rate" />}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-bold">₹{slot.price}</div>
                            </div>
                            <button
                              onClick={() => toggleSlot(slot)}
                              aria-label={`Remove ${formatSlotDate(slot.startTime)} ${formatSlotTime(slot.startTime)} from selection`}
                              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors px-2"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {!canBook && (
                    <p className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 rounded-2xl p-3">
                      You're signed in as {user?.role === 'OWNER' ? 'a turf owner' : 'an admin'}. Bookings can only be made from a player account.
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button variant="ghost" className="rounded-2xl font-bold" onClick={clearSelection}>
                      Clear
                    </Button>
                    <Button
                      disabled={!canBook}
                      className="flex-1 h-16 rounded-2xl text-xl font-black gradient-primary shadow-xl shadow-primary/30 hover:scale-[1.02] transition-transform"
                      onClick={handleProceed}
                    >
                      {isAuthenticated ? 'Confirm & Pay' : 'Log in to book'}
                    </Button>
                  </div>
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
    </div>
  );
}
