import { TimeSlot } from '@/types';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';

interface SlotSelectorProps {
  slots: TimeSlot[];
  selectedSlotIds: string[];
  onToggle: (slot: TimeSlot) => void;
}

export function SlotSelector({ slots: allSlots, selectedSlotIds, onToggle }: SlotSelectorProps) {
  const now = Date.now();
  // CLOSED slots are hours the turf isn't operating, and a slot that has
  // already started can't be booked (booking.service.js enforces this
  // server-side too — this is just so a customer never sees it as an
  // option in the first place).
  const slots = allSlots.filter(s => s.status.toUpperCase() !== 'CLOSED' && new Date(s.startTime).getTime() > now);

  if (slots.length === 0) {
    return (
      <div className="text-center py-12 glass rounded-3xl border-dashed border-primary/20">
        <CalendarIcon size={32} className="mx-auto mb-3 opacity-20 text-primary" />
        <p className="text-muted-foreground font-medium">No slots available for this date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 px-2 py-3 bg-primary/5 rounded-2xl border border-primary/10">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-success">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Available
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-warning">
          <div className="w-2 h-2 rounded-full bg-warning" />
          Locked
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-destructive">
          <div className="w-2 h-2 rounded-full bg-destructive/40" />
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

          return (
            <button
              key={slot._id}
              onClick={() => !isDisabled && onToggle(slot)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={cn(
                'relative group p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden',
                isSelected ? 'gradient-primary border-transparent shadow-xl shadow-primary/20 scale-105 z-10' :
                !isDisabled ? 'glass border-primary/5 hover:border-primary/40 hover:bg-primary/5' :
                'opacity-40 grayscale pointer-events-none border-transparent bg-muted/50'
              )}
            >
              <div className={cn("text-[10px] font-black uppercase tracking-widest mb-1",
                isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {time}
              </div>
              <div className={cn("text-lg font-black tracking-tighter",
                isSelected ? "text-primary-foreground" : "text-foreground")}>
                ₹{slot.price}
              </div>

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
