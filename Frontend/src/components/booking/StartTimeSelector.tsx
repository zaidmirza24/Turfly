import { cn } from '@/lib/utils';
import { formatSlotTime } from '@/lib/dateKey';
import { StartOption } from '@/hooks/useSlotAvailability';

type Props = {
  options: StartOption[];
  selectedStartId: string | null;
  onSelect: (option: StartOption) => void;
};

const UNAVAILABLE_BADGE: Partial<Record<StartOption['startSlot']['status'], string>> = {
  FULL: 'Full',
  BOOKED: 'Booked',
  LOCKED: 'Locked',
  CLOSED: 'Closed',
};

export function StartTimeSelector({ options, selectedStartId, onSelect }: Props) {
  if (options.every((o) => !o.bookable)) {
    return (
      <div className="text-center py-10 rounded-2xl border-2 border-dashed border-muted-foreground/10 bg-muted/20">
        <p className="text-sm font-bold text-muted-foreground">No start times available for this duration today.</p>
        <p className="text-xs text-muted-foreground mt-1">Try a shorter duration or another date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
        Available start times
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {options.map((option) => {
          const { startSlot, bookable } = option;
          const isSelected = selectedStartId === startSlot._id;
          const badge = UNAVAILABLE_BADGE[startSlot.status];
          return (
            <button
              key={startSlot._id}
              type="button"
              disabled={!bookable}
              onClick={() => onSelect(option)}
              aria-pressed={isSelected}
              className={cn(
                'relative h-12 rounded-xl border-2 font-bold text-sm transition-all',
                !bookable ? 'border-muted-foreground/10 text-muted-foreground/40 cursor-not-allowed' :
                isSelected ? 'gradient-primary border-transparent text-primary-foreground shadow-lg shadow-primary/20' :
                'border-primary/10 hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              {formatSlotTime(startSlot.startTime)}
              {!bookable && badge && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-muted-foreground/80 text-background text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
