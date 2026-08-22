import { cn } from '@/lib/utils';
import { formatSlotTime } from '@/lib/dateKey';
import { StartOption } from '@/hooks/useSlotAvailability';

type Props = {
  options: StartOption[];
  selectedStartId: string | null;
  onSelect: (option: StartOption) => void;
};

export function StartTimeSelector({ options, selectedStartId, onSelect }: Props) {
  if (options.length === 0) {
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
        {options.map(({ startSlot }) => {
          const isSelected = selectedStartId === startSlot._id;
          return (
            <button
              key={startSlot._id}
              type="button"
              onClick={() => onSelect(options.find((o) => o.startSlot._id === startSlot._id)!)}
              aria-pressed={isSelected}
              className={cn(
                'h-12 rounded-xl border-2 font-bold text-sm transition-all',
                isSelected ? 'gradient-primary border-transparent text-primary-foreground shadow-lg shadow-primary/20' :
                'border-primary/10 hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              {formatSlotTime(startSlot.startTime)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
