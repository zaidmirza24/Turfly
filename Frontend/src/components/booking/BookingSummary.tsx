import { TimeSlot } from '@/types';
import { formatSlotDate, formatSlotTime, toISTDateKey } from '@/lib/dateKey';
import { formatDuration } from '@/lib/duration';
import { Button } from '@/components/ui/button';
import { Pencil, ArrowRight } from 'lucide-react';

type Props = {
  /** Contiguous half-hour slots making up the booking, in chronological order. */
  slots: TimeSlot[];
  onChange?: () => void;
};

/**
 * Renders a duration-based booking (however many 30-min Slot documents it's
 * actually made of) as one readable range — "11:00 PM → 2:00 AM" — instead of
 * a list of half-hour line items. Crossing midnight is called out explicitly
 * (each side gets its own date) so "2:00 AM" is never ambiguous about which
 * calendar day it falls on.
 */
export function BookingSummary({ slots, onChange }: Props) {
  if (slots.length === 0) return null;

  const first = slots[0];
  const last = slots[slots.length - 1];
  const durationMinutes = slots.length * 30;
  const totalPrice = slots.reduce((sum, s) => sum + s.price, 0);
  const crossesMidnight = toISTDateKey(first.startTime) !== toISTDateKey(last.endTime);

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-[2rem] p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-primary">Booking Summary</div>
        {onChange && (
          <button
            onClick={onChange}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            <Pencil size={11} /> Change
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap font-black text-lg tracking-tight">
        <span>{formatSlotTime(first.startTime)}</span>
        {crossesMidnight && <span className="text-xs font-bold text-muted-foreground">{formatSlotDate(first.startTime)}</span>}
        <ArrowRight size={16} className="text-primary shrink-0" />
        <span>{formatSlotTime(last.endTime)}</span>
        {crossesMidnight && <span className="text-xs font-bold text-muted-foreground">{formatSlotDate(last.endTime)}</span>}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-bold">{formatDuration(durationMinutes)}</span>
        <span className="font-black text-primary text-xl">₹{totalPrice}</span>
      </div>
    </div>
  );
}
