import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useBooking } from '@/contexts/BookingContext';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { turfCoverImage } from '@/lib/imageUrl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, ChevronLeft, CreditCard, Loader2, ShieldAlert,
  Navigation, Phone, CalendarPlus, Share2, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Booking } from '@/types';
import { downloadIcsFile, googleCalendarUrl, directionsUrl } from '@/lib/calendarExport';

type Step = 'summary' | 'payment' | 'success' | 'failure';

export default function BookingFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedSlots, createBooking } = useBooking();

  const [step, setStep] = useState<Step>('summary');
  const [loading, setLoading] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([]);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Fetch Turf Detail
  const { data: turfResponse, isLoading: isLoadingTurf } = useQuery({
    queryKey: ['turf', id],
    queryFn: () => apiGet<Turf>(`/turfs/${id}`),
    enabled: !!id,
  });

  const turf = turfResponse?.data;

  // IMPORTANT: Keep a local copy of the slots because the global context
  // will clear the selection once the booking succeeds.
  const [localSlots] = useState(selectedSlots);
  const sortedSlots = [...localSlots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (isLoadingTurf) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If we're not in success/failure and don't have any slots, go back
  if (step !== 'success' && step !== 'failure' && (!turf || sortedSlots.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">No slot selected</h1>
        <p className="text-muted-foreground mt-2">Please select a slot from the turf page first.</p>
        <Button className="mt-4" onClick={() => navigate(`/turfs/${id || ''}`)}>Go Back</Button>
      </div>
    );
  }

  const total = sortedSlots.reduce((sum, s) => sum + s.price, 0);
  const durationHours = sortedSlots.length;

  // A slot conflict (someone else confirmed it while this customer was on the
  // summary/payment screen) surfaces as a 409 from the server. The stale
  // availability that led to it lives in these two query caches — the
  // per-date grid and the calendar's month-range dots — so a retry from
  // /turfs/:id should see the real state rather than what was true when this
  // checkout started.
  const invalidateAvailability = () => {
    queryClient.invalidateQueries({ queryKey: ['slots', id] });
    queryClient.invalidateQueries({ queryKey: ['slots-month', id] });
  };

  const handlePayment = async () => {
    // `loading` also guards the double-submit case: the button is disabled
    // while in flight, but a second click can still land between the click
    // and React's re-render, and each one would try to book the same slots.
    if (sortedSlots.length === 0 || loading) return;
    setLoading(true);
    try {
      const slotIds = sortedSlots.map(s => s._id);
      const res = await createBooking(slotIds);
      // /bookings returns a single Booking object; /bookings/multi returns an array.
      const bookings: Booking[] = Array.isArray(res) ? res : [res];
      setConfirmedBookings(bookings);

      // Invalidate queries to update UI elsewhere
      queryClient.invalidateQueries({ queryKey: ['all-slots', id] });
      invalidateAvailability();
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });

      toast.success(sortedSlots.length > 1 ? 'Slots booked!' : 'Booking confirmed!');
      setStep('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Booking failed';
      toast.error(message);
      setFailureReason(message);
      invalidateAvailability();
      setStep('failure');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    // Charged amount comes from the created bookings, not from the slot prices
    // held in this tab: if an owner repriced a slot between page load and
    // payment, the server's number is the one the customer actually paid.
    const chargedTotal = confirmedBookings.reduce((sum, b) => sum + (b.amount ?? 0), 0);
    const groupId = confirmedBookings[0]?.groupId;
    const reference = groupId || confirmedBookings[0]?._id;
    const firstSlot = sortedSlots[0];
    const lastSlot = sortedSlots[sortedSlots.length - 1];

    const calendarEvent = turf && firstSlot ? {
      title: `${turf.name} — Turf Booking`,
      description: `Booking reference: ${reference}\n${sortedSlots.length} slot(s), ₹${chargedTotal} paid.`,
      location: turf.location,
      start: new Date(firstSlot.startTime),
      end: new Date(lastSlot.endTime),
      uid: reference || 'booking',
    } : null;

    const shareText = turf
      ? `Booking confirmed at ${turf.name} — ${formatSlotDate(firstSlot.startTime)} · ${formatSlotTime(firstSlot.startTime)}. Ref: ${reference}`
      : '';

    const handleShare = async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Booking Confirmation', text: shareText });
          return;
        } catch {
          // User cancelled the native share sheet — fall through to clipboard.
        }
      }
      await navigator.clipboard.writeText(shareText);
      toast.success('Confirmation copied to clipboard');
    };

    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-5 sm:p-8 shadow-sm">
          <CheckCircle2 size={64} className="mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold">Booking Confirmed! 🎉</h1>
          <p className="text-muted-foreground mt-2">
            {sortedSlots.length > 1 ? `Your ${sortedSlots.length} slots have been successfully booked.` : 'Your slot has been successfully booked.'}
          </p>
          <div className="bg-muted/50 rounded-lg p-4 mt-6 text-sm space-y-2 text-left">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Venue</span><span className="font-medium text-right truncate min-w-0">{turf?.name}</span></div>
            {sortedSlots.map(slot => (
              <div key={slot._id} className="flex justify-between gap-3">
                <span className="text-muted-foreground truncate min-w-0">{formatSlotDate(slot.startTime)}</span>
                <span className="font-medium shrink-0">{formatSlotTime(slot.startTime)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationHours} hour{durationHours > 1 ? 's' : ''}</span></div>
            <div className="flex justify-between gap-3 font-bold border-t pt-2"><span>Total Paid</span><span className="text-primary">₹{chargedTotal}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payment status</span><span className="font-medium text-success">Paid (simulated)</span></div>
            <div className="flex justify-between gap-3 text-[10px] text-muted-foreground mt-2"><span className="shrink-0">Booking Reference</span><span className="truncate min-w-0">#{reference}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" size="sm" className="gap-1.5 h-auto py-2 whitespace-normal text-center" asChild>
              <a href={directionsUrl(turf?.location ?? '', turf?.geo)} target="_blank" rel="noopener noreferrer">
                <Navigation size={14} className="shrink-0" /> Directions
              </a>
            </Button>
            {turf?.contactPhone && (
              <Button variant="outline" size="sm" className="gap-1.5 h-auto py-2 whitespace-normal text-center" asChild>
                <a href={`tel:${turf.contactPhone}`}><Phone size={14} className="shrink-0" /> Contact venue</a>
              </Button>
            )}
            {calendarEvent && (
              <Button variant="outline" size="sm" className="gap-1.5 h-auto py-2 whitespace-normal text-center" onClick={() => downloadIcsFile(calendarEvent)}>
                <CalendarPlus size={14} className="shrink-0" /> Add to calendar
              </Button>
            )}
            {calendarEvent && (
              <Button variant="outline" size="sm" className="gap-1.5 h-auto py-2 whitespace-normal text-center" asChild>
                <a href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer">
                  <CalendarPlus size={14} className="shrink-0" /> Google Calendar
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" className={cn('gap-1.5 h-auto py-2 whitespace-normal text-center', turf?.contactPhone && 'col-span-2')} onClick={handleShare}>
              {navigator.share ? <Share2 size={14} className="shrink-0" /> : <Copy size={14} className="shrink-0" />} Share confirmation
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>Manage in My Bookings</Button>
            <Button className="flex-1" onClick={() => navigate('/turfs')}>Book Another</Button>
          </div>
          <Link to={`/help?booking=${reference}`} className="text-xs text-muted-foreground hover:text-primary underline mt-4 inline-block">
            Need help with this booking?
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'failure') {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
          <XCircle size={64} className="mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground mt-2">
            We couldn't complete your booking — {failureReason || 'please try again.'}
          </p>
          <p className="text-xs font-medium text-success mt-2">Your payment has not been charged.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate(`/turfs/${id}`)}>Go Back</Button>
            <Button className="flex-1" onClick={() => { setFailureReason(null); setStep('summary'); }}>Retry</Button>
          </div>
          <Link to="/help" className="text-xs text-muted-foreground hover:text-primary underline mt-4 inline-block">
            Still stuck? Contact support
          </Link>
        </div>
      </div>
    );
  }

  const sports = turf?.sportsType || [];
  const image = turfCoverImage(turf?.images);

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <Button variant="ghost" size="sm" className="gap-1 mb-6" onClick={() => navigate(-1)}>
        <ChevronLeft size={16} /> Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">
        {step === 'summary' ? 'Booking Summary' : 'Payment'}
      </h1>

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <div className="flex gap-4 mb-6">
          <img src={image} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-muted shrink-0" loading="lazy" />
          <div className="min-w-0">
            <h2 className="font-semibold text-lg truncate">{turf?.name}</h2>
            <p className="text-sm text-muted-foreground truncate">{turf?.location}</p>
            <p className="text-sm text-muted-foreground capitalize mt-1 truncate">{sports.join(', ')}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm border-t pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base price</div>
          <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
            {sortedSlots.map(slot => (
              <div key={slot._id} className="flex justify-between gap-3">
                <span className="text-muted-foreground truncate min-w-0">
                  {formatSlotDate(slot.startTime)} · {formatSlotTime(slot.startTime)}
                </span>
                <span className="font-medium shrink-0">₹{slot.price}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationHours} hour{durationHours > 1 ? 's' : ''}</span></div>
          <div className="flex justify-between gap-3 text-muted-foreground"><span>Taxes &amp; platform fee</span><span className="shrink-0">₹0 — none charged</span></div>
          <div className="flex justify-between gap-3 text-lg font-bold border-t pt-3">
            <span>Total Amount</span><span className="text-primary shrink-0">₹{total}</span>
          </div>
        </div>

        <div className="mt-6 border rounded-xl p-4 bg-muted/30 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Cancellation policy</p>
          <p>Free cancellation up to 6 hours before your slot starts, from My Bookings. No charge is made until you confirm below, so there's nothing to refund if you cancel in time.</p>
        </div>

        {step === 'summary' && (
          <Button className="w-full mt-6" size="lg" onClick={() => setStep('payment')}>
            <CreditCard size={18} className="mr-2" /> Proceed to Payment
          </Button>
        )}

        {step === 'payment' && (
          <div className="mt-6 space-y-4">
            <div className="border rounded-xl p-4 bg-muted/30">
              <h3 className="font-medium mb-3">Payment Method (Phase 1)</h3>
              <div className="flex items-start gap-2 text-xs text-muted-foreground mb-3 bg-warning/10 border border-warning/20 rounded-lg p-2.5">
                <ShieldAlert size={14} className="shrink-0 mt-0.5 text-warning" />
                <span>This checkout is simulated — no real payment is processed and no money is charged. A real gateway (UPI/cards/net banking) will replace this before launch.</span>
              </div>
              <div className="space-y-2">
                {['UPI / Google Pay', 'Credit / Debit Card', 'Net Banking'].map((method, i) => (
                  <label key={method} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                    <input type="radio" name="payment" defaultChecked={i === 0} className="accent-primary" />
                    <span className="text-sm">{method}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={agreedToPolicy} onCheckedChange={(v) => setAgreedToPolicy(!!v)} className="mt-0.5" />
              <span>
                I agree to the <Link to="/terms" target="_blank" className="underline hover:text-primary">Terms &amp; Conditions</Link> and the cancellation policy above.
              </span>
            </label>

            <Button className="w-full" size="lg" onClick={handlePayment} disabled={loading || !agreedToPolicy}>
              {loading ? <><Loader2 size={18} className="mr-2 animate-spin" /> Processing...</> : `Confirm & Pay ₹${total}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
