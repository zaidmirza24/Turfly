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
  CheckCircle2, XCircle, ChevronLeft, CreditCard, Loader2, ShieldCheck,
  Navigation, Phone, CalendarPlus, Share2, Copy, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Booking } from '@/types';
import { downloadIcsFile, googleCalendarUrl, directionsUrl } from '@/lib/calendarExport';
import { lockSlotsForCheckout, createPaymentOrder, verifyPayment, getPayment } from '@/lib/payments';
import { loadRazorpayScript, openRazorpayCheckout } from '@/lib/razorpay';

type Step = 'summary' | 'payment' | 'verifying' | 'success' | 'failure' | 'unavailable';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function BookingFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedSlots, clearSelection } = useBooking();

  const [step, setStep] = useState<Step>('summary');
  const [loading, setLoading] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([]);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [verifyingMessage, setVerifyingMessage] = useState('Verifying your payment...');
  // Preserved across a failed-payment retry within this checkout session so
  // retrying reuses the same Razorpay order instead of creating a new one
  // for every double-click / failed-attempt-then-retry (Phase 9).
  const [checkout, setCheckout] = useState<{ paymentId: string; groupId: string } | null>(null);

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
  // Each slot is 30 minutes, not an hour — sum actual elapsed time instead of
  // counting slots, and format it as "1h 30m" style text below.
  const durationMinutes = sortedSlots.length * 30;
  const durationLabel = durationMinutes % 60 === 0
    ? `${durationMinutes / 60}h`
    : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;

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

  const onCheckoutSuccess = (bookings: Booking[]) => {
    setConfirmedBookings(bookings);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ['all-slots', id] });
    invalidateAvailability();
    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    toast.success(sortedSlots.length > 1 ? 'Slots booked!' : 'Booking confirmed!');
    setStep('success');
  };

  const onCheckoutFailure = (message: string) => {
    toast.error(message);
    setFailureReason(message);
    invalidateAvailability();
    setStep('failure');
  };

  /**
   * The Razorpay Checkout `handler` callback fires as soon as the browser
   * gets a response — it is never trusted as proof of payment on its own
   * (Phase 7/16). It only triggers server-side verification; if that call
   * itself fails to come back cleanly (dropped connection, tab backgrounded
   * mid-request), the outcome is genuinely uncertain rather than a failure,
   * so this polls our own payment record instead of guessing.
   */
  const handleRazorpaySuccess = async (
    paymentId: string,
    response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  ) => {
    setStep('verifying');
    setVerifyingMessage('Verifying your payment...');
    try {
      const res = await verifyPayment({ paymentId, ...response });
      if (res.data.bookingFailed) {
        onCheckoutFailure('Payment received, but this slot was taken by another customer at the same moment — a full refund has been automatically initiated. Check your email for details.');
        return;
      }
      onCheckoutSuccess(res.data.bookings);
    } catch {
      // Verification itself failed to complete — the webhook may still
      // confirm it independently, so poll our own record rather than
      // declaring failure on an inconclusive signal.
      setVerifyingMessage('Still confirming your payment — this can take a few seconds...');
      for (let attempt = 0; attempt < 6; attempt++) {
        await sleep(2000);
        try {
          const poll = await getPayment(paymentId);
          if (poll.data.status === 'PAID') {
            onCheckoutSuccess((poll.data.bookingIds as unknown as Booking[]) ?? []);
            return;
          }
          if (poll.data.status === 'FAILED' || poll.data.status === 'EXPIRED') {
            onCheckoutFailure('Payment could not be confirmed. If you were charged, it will be automatically refunded.');
            return;
          }
        } catch {
          // transient — keep polling until the attempt budget runs out
        }
      }
      // Genuinely inconclusive after polling: never claim "failed" on an
      // uncertain result — direct the customer to where the truth will land.
      toast.message("We couldn't confirm your payment status yet — check My Bookings in a moment. If you were charged and no booking appears, it will be automatically refunded.");
      navigate('/dashboard');
    }
  };

  const handlePayment = async () => {
    // `loading` also guards the double-submit case: the button is disabled
    // while in flight, but a second click can still land between the click
    // and React's re-render, and each one would try to book the same slots.
    if (sortedSlots.length === 0 || loading) return;
    setLoading(true);
    try {
      const slotIds = sortedSlots.map(s => s._id);

      if (!checkout) {
        // First attempt: hold the slots, then open a fresh order.
        await lockSlotsForCheckout(slotIds);
      }
      const orderRes = await createPaymentOrder(slotIds, checkout?.groupId);
      const order = orderRes.data;
      setCheckout({ paymentId: order.paymentId, groupId: order.groupId });

      await loadRazorpayScript();
      openRazorpayCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#16a34a' },
        handler: (response) => {
          void handleRazorpaySuccess(order.paymentId, response);
        },
        modal: {
          ondismiss: () => {
            // Slot hold is still active — this is a cancelled checkout, not
            // a failed payment. Let the customer retry from the same screen.
            setLoading(false);
            toast.info('Payment cancelled — your slot is still held, you can try again');
          },
        },
      }, (error) => {
        // payment.failed only ever fires for an actual failed attempt (card
        // declined, UPI timeout, etc) — Razorpay's own checkout UI stays open
        // and lets the customer retry immediately, so this is a same-session
        // UX signal only. The authoritative state change still comes from the
        // payment.failed *webhook* (payment.service.js), same as everywhere
        // else — this toast never updates Payment/Booking state itself.
        toast.error(error.description || 'Payment failed — you can try again');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start payment';
      if (message.includes('not configured')) {
        setStep('unavailable');
      } else {
        onCheckoutFailure(message);
      }
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
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationLabel}</span></div>
            <div className="flex justify-between gap-3 font-bold border-t pt-2"><span>Total Paid</span><span className="text-primary">₹{chargedTotal}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payment status</span><span className="font-medium text-success">Paid</span></div>
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

  if (step === 'verifying') {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
          <Loader2 size={48} className="mx-auto text-primary mb-4 animate-spin" />
          <h1 className="text-xl font-bold">{verifyingMessage}</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Please don't close this page. Your booking will only be confirmed once we've verified the payment with Razorpay.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'unavailable') {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
          <Clock size={64} className="mx-auto text-warning mb-4" />
          <h1 className="text-2xl font-bold">Payments are temporarily unavailable</h1>
          <p className="text-muted-foreground mt-2">
            Online payments couldn't be started right now. Please try again shortly, or contact the venue directly to book.
          </p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate(`/turfs/${id}`)}>Go Back</Button>
            {turf?.contactPhone && (
              <Button className="flex-1" asChild><a href={`tel:${turf.contactPhone}`}>Call venue</a></Button>
            )}
          </div>
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
            {failureReason || "We couldn't complete your payment — please try again."}
          </p>
          <p className="text-xs font-medium text-muted-foreground mt-2">
            If your payment was actually charged, it will be automatically refunded — you can check the status from My Bookings.
          </p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate(`/turfs/${id}`)}>Go Back</Button>
            <Button className="flex-1" onClick={() => { setFailureReason(null); setStep('payment'); }}>Retry Payment</Button>
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
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationLabel}</span></div>
          <div className="flex justify-between gap-3 text-muted-foreground"><span>Taxes &amp; platform fee</span><span className="shrink-0">₹0 — none charged</span></div>
          <div className="flex justify-between gap-3 text-lg font-bold border-t pt-3">
            <span>Total Amount</span><span className="text-primary shrink-0">₹{total}</span>
          </div>
        </div>

        <div className="mt-6 border rounded-xl p-4 bg-muted/30 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Cancellation policy</p>
          <p>Free cancellation up to 6 hours before your slot starts, from My Bookings — cancelling in time refunds the full amount to your original payment method.</p>
        </div>

        {step === 'summary' && (
          <Button className="w-full mt-6" size="lg" onClick={() => setStep('payment')}>
            <CreditCard size={18} className="mr-2" /> Proceed to Payment
          </Button>
        )}

        {step === 'payment' && (
          <div className="mt-6 space-y-4">
            <div className="border rounded-xl p-4 bg-muted/30">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={14} className="shrink-0 mt-0.5 text-success" />
                <span>You'll pay securely via Razorpay — UPI, cards, net banking and wallets are all supported. Your card/UPI details are handled entirely by Razorpay and never reach our servers.</span>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={agreedToPolicy} onCheckedChange={(v) => setAgreedToPolicy(!!v)} className="mt-0.5" />
              <span>
                I agree to the <Link to="/terms" target="_blank" className="underline hover:text-primary">Terms &amp; Conditions</Link> and the cancellation policy above.
              </span>
            </label>

            <Button className="w-full" size="lg" onClick={handlePayment} disabled={loading || !agreedToPolicy}>
              {loading ? <><Loader2 size={18} className="mr-2 animate-spin" /> Opening secure payment...</> : <><CreditCard size={18} className="mr-2" /> Pay ₹{total}</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
