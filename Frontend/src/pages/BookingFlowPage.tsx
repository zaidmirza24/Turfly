import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useBooking } from '@/contexts/BookingContext';
import { formatSlotDate, formatSlotTime } from '@/lib/dateKey';
import { turfCoverImage } from '@/lib/imageUrl';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, ChevronLeft, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Booking } from '@/types';

type Step = 'summary' | 'payment' | 'success' | 'failure';

export default function BookingFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedSlots, createBooking } = useBooking();

  const [step, setStep] = useState<Step>('summary');
  const [loading, setLoading] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: ['slots', id] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });

      toast.success(sortedSlots.length > 1 ? 'Slots booked!' : 'Booking confirmed!');
      setStep('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Booking failed';
      toast.error(message);
      setFailureReason(message);
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
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
          <CheckCircle2 size={64} className="mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold">Booking Confirmed! 🎉</h1>
          <p className="text-muted-foreground mt-2">
            {sortedSlots.length > 1 ? `Your ${sortedSlots.length} slots have been successfully booked.` : 'Your slot has been successfully booked.'}
          </p>
          <div className="bg-muted/50 rounded-lg p-4 mt-6 text-sm space-y-2 text-left">
            <div className="flex justify-between"><span className="text-muted-foreground">Turf</span><span className="font-medium">{turf?.name}</span></div>
            {sortedSlots.map(slot => (
              <div key={slot._id} className="flex justify-between">
                <span className="text-muted-foreground">{formatSlotDate(slot.startTime)}</span>
                <span className="font-medium">{formatSlotTime(slot.startTime)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold border-t pt-2"><span>Total Paid</span><span className="text-primary">₹{chargedTotal}</span></div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2"><span>Booking Reference</span><span>{reference}</span></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>My Bookings</Button>
            <Button className="flex-1" onClick={() => navigate('/turfs')}>Book Another</Button>
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
          <h1 className="text-2xl font-bold">Booking Failed</h1>
          <p className="text-muted-foreground mt-2">{failureReason || 'Something went wrong.'}</p>
          <p className="text-xs text-muted-foreground mt-2">Nothing was charged.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate(`/turfs/${id}`)}>Go Back</Button>
            <Button className="flex-1" onClick={() => { setFailureReason(null); setStep('summary'); }}>Retry</Button>
          </div>
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
          <img src={image} alt="" className="w-24 h-24 rounded-xl object-cover bg-muted shrink-0" loading="lazy" />
          <div>
            <h2 className="font-semibold text-lg">{turf?.name}</h2>
            <p className="text-sm text-muted-foreground">{turf?.location}</p>
            <p className="text-sm text-muted-foreground capitalize mt-1">{sports.join(', ')}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm border-t pt-4">
          {sortedSlots.map(slot => (
            <div key={slot._id} className="flex justify-between">
              <span className="text-muted-foreground">
                {formatSlotDate(slot.startTime)} · {formatSlotTime(slot.startTime)}
              </span>
              <span className="font-medium">₹{slot.price}</span>
            </div>
          ))}
          <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{sortedSlots.length} hour{sortedSlots.length > 1 ? 's' : ''}</span></div>
          <div className="flex justify-between text-lg font-bold border-t pt-3">
            <span>Total Amount</span><span className="text-primary">₹{total}</span>
          </div>
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
              <p className="text-xs text-muted-foreground mb-3 italic">Payment is simulated for this phase.</p>
              <div className="space-y-2">
                {['UPI / Google Pay', 'Credit / Debit Card', 'Net Banking'].map((method, i) => (
                  <label key={method} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                    <input type="radio" name="payment" defaultChecked={i === 0} className="accent-primary" />
                    <span className="text-sm">{method}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={handlePayment} disabled={loading}>
              {loading ? <><Loader2 size={18} className="mr-2 animate-spin" /> Processing...</> : `Confirm & Pay ₹${total}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
