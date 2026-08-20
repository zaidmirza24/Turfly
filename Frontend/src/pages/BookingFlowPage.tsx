import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBooking } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, ChevronLeft, CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Turf } from '@/types';

type Step = 'summary' | 'payment' | 'success' | 'failure';

export default function BookingFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedSlot, createBooking } = useBooking();
  const { user } = useAuth();
  
  const [step, setStep] = useState<Step>('summary');
  const [loading, setLoading] = useState(false);
  const [confirmedBookingData, setConfirmedBookingData] = useState<any>(null);

  // Fetch Turf Detail
  const { data: turfResponse, isLoading: isLoadingTurf } = useQuery({
    queryKey: ['turf', id],
    queryFn: () => api.get(`/turfs/${id}`),
    enabled: !!id,
  });

  const turf = (turfResponse as any)?.data as Turf;

  // IMPORTANT: Keep a local copy of the slot details for the success screen
  // because the global context will clear it once booked.
  const [localSlot] = useState(selectedSlot);

  if (isLoadingTurf) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If we're not in success/failure and don't have a slot, go back
  if (step !== 'success' && step !== 'failure' && (!turf || !localSlot)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">No slot selected</h1>
        <p className="text-muted-foreground mt-2">Please select a slot from the turf page first.</p>
        <Button className="mt-4" onClick={() => navigate(`/turfs/${id || ''}`)}>Go Back</Button>
      </div>
    );
  }

  const price = localSlot?.price || 0;
  const total = price;

  const handlePayment = async () => {
    if (!localSlot) return;
    setLoading(true);
    try {
      const slotId = localSlot._id || (localSlot as any).id;
      const res = await createBooking(slotId);
      setConfirmedBookingData(res.data);
      
      // Invalidate queries to update UI elsewhere
      queryClient.invalidateQueries({ queryKey: ['all-slots', id] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      
      toast.success('Booking confirmed!');
      setStep('success');
    } catch (error: any) {
      console.error('Booking failed:', error);
      toast.error(error.message || 'Booking failed');
      setStep('failure');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
          <CheckCircle2 size={64} className="mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold">Booking Confirmed! 🎉</h1>
          <p className="text-muted-foreground mt-2">Your slot has been successfully booked.</p>
          <div className="bg-muted/50 rounded-lg p-4 mt-6 text-sm space-y-2 text-left">
            <div className="flex justify-between"><span className="text-muted-foreground">Turf</span><span className="font-medium">{turf?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{localSlot && new Date(localSlot.startTime).toLocaleDateString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{localSlot && new Date(localSlot.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
            <div className="flex justify-between font-bold border-t pt-2"><span>Total Paid</span><span className="text-primary">₹{total}</span></div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-2"><span>Booking ID</span><span>{confirmedBookingData?._id}</span></div>
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
          <p className="text-muted-foreground mt-2">The slot might have been taken or there was a system error. Please try again.</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" className="flex-1" onClick={() => navigate(`/turfs/${id}`)}>Go Back</Button>
            <Button className="flex-1" onClick={() => { setStep('summary'); }}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  const sports = turf?.sportsType || turf?.sport || [];
  const image = turf?.images?.[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800';

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
          <img src={image} alt={turf?.name} className="w-24 h-24 rounded-xl object-cover" />
          <div>
            <h2 className="font-semibold text-lg">{turf?.name}</h2>
            <p className="text-sm text-muted-foreground">{turf?.location}</p>
            <p className="text-sm text-muted-foreground capitalize mt-1">{sports.join(', ')}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm border-t pt-4">
          <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{localSlot && new Date(localSlot.startTime).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Time Slot</span><span className="font-medium">{localSlot && new Date(localSlot.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">1 hour</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Price</span><span className="font-medium">₹{price}</span></div>
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
