import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Search, UserPlus, X } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Booking, TimeSlot, Turf, User } from '@/types';
import { toDateKey } from '@/lib/dateKey';
import { formatSlotTime } from '@/lib/dateKey';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const SLOT_MINUTES = 30;
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ slots: n, label: `${n * SLOT_MINUTES} min` }));

type Customer = Pick<User, '_id' | 'name' | 'phone' | 'email' | 'isGuest'>;

export function ManualBookingModal({ turfs }: { turfs: Turf[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [turfId, setTurfId] = useState('');
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [startSlotId, setStartSlotId] = useState('');
  const [durationSlots, setDurationSlots] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'ONLINE' | 'PENDING'>('CASH');
  const [notes, setNotes] = useState('');

  const [customerQuery, setCustomerQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  useEffect(() => {
    if (open && !turfId && turfs.length > 0) setTurfId(turfs[0]._id);
  }, [open, turfId, turfs]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(customerQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  const { data: slotsResponse, isLoading: isLoadingSlots } = useQuery({
    queryKey: ['manual-booking-slots', turfId, dateKey],
    queryFn: () => apiGet<TimeSlot[]>(`/slots?turfId=${turfId}&startDate=${dateKey}&endDate=${dateKey}`),
    enabled: open && !!turfId,
  });
  const slots = useMemo(
    () => (slotsResponse?.data ?? []).slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [slotsResponse]
  );
  const availableSlots = slots.filter((s) => s.status === 'AVAILABLE');

  const { data: searchResponse, isFetching: isSearching } = useQuery({
    queryKey: ['customer-search', debouncedQuery],
    queryFn: () => apiGet<Customer[]>(`/users/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: open && debouncedQuery.length >= 2 && !selectedCustomer,
  });
  const searchResults = searchResponse?.data ?? [];

  // Contiguous AVAILABLE slots starting at the chosen start slot — the same
  // "no gaps or overlaps" rule the backend enforces, computed here so the
  // owner sees unavailability before submitting rather than after a 400.
  const { selectedSlotIds, coversAllAvailable, totalPrice } = useMemo(() => {
    if (!startSlotId) return { selectedSlotIds: [] as string[], coversAllAvailable: false, totalPrice: 0 };
    const startIdx = slots.findIndex((s) => s._id === startSlotId);
    if (startIdx === -1) return { selectedSlotIds: [] as string[], coversAllAvailable: false, totalPrice: 0 };

    const picked: TimeSlot[] = [];
    let expectedStart = slots[startIdx].startTime;
    for (let i = startIdx; i < slots.length && picked.length < durationSlots; i++) {
      const s = slots[i];
      if (s.startTime !== expectedStart || s.status !== 'AVAILABLE') break;
      picked.push(s);
      expectedStart = s.endTime;
    }
    return {
      selectedSlotIds: picked.map((s) => s._id),
      coversAllAvailable: picked.length === durationSlots,
      totalPrice: picked.reduce((sum, s) => sum + s.price, 0),
    };
  }, [startSlotId, durationSlots, slots]);

  const guestMutation = useMutation({
    mutationFn: () => apiPost<User>('/users/guest', { name: guestName.trim(), phone: guestPhone.trim() }),
    onSuccess: (res) => {
      setSelectedCustomer(res.data);
      setShowGuestForm(false);
      setGuestName('');
      setGuestPhone('');
      toast.success('Guest customer added');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to add guest customer'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<Booking[]>('/bookings/manual', {
        turfId,
        customerId: selectedCustomer?._id,
        slotIds: selectedSlotIds,
        paymentMethod,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Booking created');
      ['owner-bookings', 'owner-bookings-dashboard', 'owner-customers'].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      resetAndClose();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create booking'),
  });

  const resetAndClose = () => {
    setOpen(false);
    setStartSlotId('');
    setDurationSlots(2);
    setPaymentMethod('CASH');
    setNotes('');
    setCustomerQuery('');
    setDebouncedQuery('');
    setSelectedCustomer(null);
    setShowGuestForm(false);
  };

  const canSubmit = !!turfId && !!selectedCustomer && selectedSlotIds.length > 0 && coversAllAvailable;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full font-bold">
          <Plus size={16} /> New Booking
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Manual Booking</DialogTitle>
          <DialogDescription>Record a phone or walk-in booking on a customer's behalf.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Turf</Label>
              <Select value={turfId} onValueChange={(v) => { setTurfId(v); setStartSlotId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select turf" /></SelectTrigger>
                <SelectContent>
                  {turfs.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={dateKey}
                onChange={(e) => { setDateKey(e.target.value); setStartSlotId(''); }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Start time</Label>
            {isLoadingSlots ? (
              <div className="text-sm text-muted-foreground py-2"><Loader2 className="animate-spin inline mr-2" size={14} />Loading slots…</div>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No available slots on this date.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {availableSlots.map((s) => (
                  <button
                    type="button"
                    key={s._id}
                    onClick={() => setStartSlotId(s._id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                      startSlotId === s._id ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
                    )}
                  >
                    {formatSlotTime(s.startTime)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={String(durationSlots)} onValueChange={(v) => setDurationSlots(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => <SelectItem key={d.slots} value={String(d.slots)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {startSlotId && !coversAllAvailable && (
              <p className="text-xs text-destructive">Not enough consecutive available slots for this duration — pick a shorter duration or a different start time.</p>
            )}
            {coversAllAvailable && (
              <p className="text-sm font-bold">Total: ₹{totalPrice}</p>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Customer</Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
                <div>
                  <div className="font-bold text-sm">{selectedCustomer.name} {selectedCustomer.isGuest && <span className="text-[10px] uppercase text-muted-foreground">(guest)</span>}</div>
                  <div className="text-xs text-muted-foreground">{selectedCustomer.phone || selectedCustomer.email}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(null)}><X size={16} /></Button>
              </div>
            ) : showGuestForm ? (
              <div className="space-y-2 p-3 rounded-lg border">
                <Input placeholder="Customer name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                <Input placeholder="Phone number" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowGuestForm(false)}>Back</Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!guestName.trim() || !guestPhone.trim() || guestMutation.isPending}
                    onClick={() => guestMutation.mutate()}
                  >
                    {guestMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : 'Add Guest'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, or email"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {customerQuery.trim().length >= 2 && (
                  <div className="border rounded-lg divide-y max-h-32 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-3 text-sm text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14} />Searching…</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No matching customers yet.</div>
                    ) : (
                      searchResults.map((c) => (
                        <button
                          type="button"
                          key={c._id}
                          onClick={() => setSelectedCustomer(c)}
                          className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="font-bold text-sm">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phone || c.email}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowGuestForm(true)}>
                  <UserPlus size={14} /> New guest customer
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Payment</Label>
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="CASH" id="pm-cash" /><Label htmlFor="pm-cash" className="font-normal">Cash</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ONLINE" id="pm-online" /><Label htmlFor="pm-online" className="font-normal">Already paid online</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PENDING" id="pm-pending" /><Label htmlFor="pm-pending" className="font-normal">Collect later</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea placeholder="e.g. repeat customer, requested court 2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
          <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Create Booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
