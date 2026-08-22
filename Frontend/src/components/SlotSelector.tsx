import { TimeSlot } from '@/types';
import { cn } from '@/lib/utils';
import { CalendarIcon, CheckCircle2, Lock, XCircle, Flame } from 'lucide-react';

const DISABLED_STATUS_META: Record<string, { label: string; icon: typeof Lock }> = {
  BOOKED: { label: 'Booked', icon: XCircle },
  LOCKED: { label: 'Locked', icon: Lock },
  FULL: { label: 'Full', icon: XCircle },
};

interface SlotSelectorProps {
  slots: TimeSlot[];
  selectedSlotIds: string[];
  onToggle: (slot: TimeSlot) => void;
}

export function SlotSelector({ slots: allSlots, selectedSlotIds, onToggle }: SlotSelectorProps) {
  const now = Date.now();
  // CLOSED slots are hours the turf isn't operating, and a slot that's
  // already started can't be booked (booking.service.js enforces both
  // server-side too — this is just so a customer never sees either as a
  // selectable option).
  const slots = allSlots.filter(
    s => s.status.toUpperCase() !== 'CLOSED' && new Date(s.startTime).getTime() > now
  );

  if (slots.length === 0) {
    return (
      <div className="text-center py-12 glass rounded-3xl border-dashed border-primary/20">
        <CalendarIcon size={32} className="mx-auto mb-3 opacity-20 text-primary" />
        <p className="text-muted-foreground font-medium">No slots available for this date.</p>
      </div>
    );
  }

  // A slot priced above this day's average is flagged "Peak" — the model
  // doesn't carry an explicit peak flag, but owners already price individual
  // slots (or the whole weekend) higher for high-demand hours, so the
  // average is a real signal rather than a guess.
  const bookableSlots = slots.filter(s => s.status.toUpperCase() === 'AVAILABLE');
  const avgPrice = bookableSlots.length
    ? bookableSlots.reduce((sum, s) => sum + s.price, 0) / bookableSlots.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 px-2 py-3 bg-primary/5 rounded-2xl border border-primary/10">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-success">
          <CheckCircle2 size={12} />
          Available
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-warning">
          <Lock size={12} />
          Locked
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-destructive">
          <XCircle size={12} />
          Booked
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slots.map(slot => {
          const isSelected = selectedSlotIds.includes(slot._id);
          const status = slot.status.toUpperCase();
          const isDisabled = status === 'BOOKED' || status === 'LOCKED' || status === 'FULL';

          // Explicit timeZone so the hour shown always reflects the turf's
          // own local time (India), not whatever timezone the visitor's
          // browser happens to be set to.
          const time = new Date(slot.startTime).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata',
          });

          const disabledMeta = isDisabled ? DISABLED_STATUS_META[status] : undefined;
          const DisabledIcon = disabledMeta?.icon;
          const isPeak = status === 'AVAILABLE' && avgPrice > 0 && slot.price > avgPrice;

          return (
            <button
              key={slot._id}
              onClick={() => !isDisabled && onToggle(slot)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-label={disabledMeta ? `${time}, ${disabledMeta.label}` : `${time}, ₹${slot.price}${isPeak ? ' (peak pricing)' : ''}${isSelected ? ', selected' : ''}`}
              className={cn(
                'relative group p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden',
                isSelected ? 'gradient-primary border-transparent shadow-xl shadow-primary/20 scale-105 z-10' :
                !isDisabled ? 'glass border-primary/5 hover:border-primary/40 hover:bg-primary/5' :
                'opacity-40 grayscale pointer-events-none border-transparent bg-muted/50'
              )}
            >
              {isSelected && (
                <CheckCircle2 size={14} className="absolute top-2 right-2 text-primary-foreground/80" aria-hidden="true" />
              )}
              {isPeak && !isSelected && (
                <div className="absolute top-2 right-2 flex items-center gap-0.5 text-warning" title="Peak pricing">
                  <Flame size={11} aria-hidden="true" />
                  <span className="sr-only">Peak pricing</span>
                </div>
              )}
              <div className={cn("text-[10px] font-black uppercase tracking-widest mb-1",
                isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {time}
              </div>
              <div className={cn("text-lg font-black tracking-tighter",
                isSelected ? "text-primary-foreground" : "text-foreground")}>
                ₹{slot.price}
              </div>
              {disabledMeta && DisabledIcon && (
                <div className="flex items-center gap-1 mt-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  <DisabledIcon size={10} /> {disabledMeta.label}
                </div>
              )}

              {!isDisabled && !isSelected && (
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
