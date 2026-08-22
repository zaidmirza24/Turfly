import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/duration';

type Props = {
  options: number[];
  selected: number | 'custom' | null;
  /** Whether at least one start time exists for this duration today — greyed out (but still visible) when false. */
  isAvailable: (minutes: number) => boolean;
  onSelect: (value: number | 'custom') => void;
};

export function DurationSelector({ options, selected, isAvailable, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
        How long do you want to play?
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {options.map((minutes) => {
          const available = isAvailable(minutes);
          const isSelected = selected === minutes;
          return (
            <button
              key={minutes}
              type="button"
              disabled={!available}
              onClick={() => onSelect(minutes)}
              aria-pressed={isSelected}
              title={available ? undefined : 'No available start time for this duration today'}
              className={cn(
                'h-14 rounded-2xl border-2 font-bold text-sm transition-all',
                isSelected ? 'gradient-primary border-transparent text-primary-foreground shadow-lg shadow-primary/20' :
                available ? 'border-primary/10 hover:border-primary/40 hover:bg-primary/5' :
                'opacity-40 grayscale cursor-not-allowed border-transparent bg-muted/50'
              )}
            >
              {formatDuration(minutes)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onSelect('custom')}
          aria-pressed={selected === 'custom'}
          className={cn(
            'h-14 rounded-2xl border-2 font-bold text-sm transition-all',
            selected === 'custom' ? 'gradient-primary border-transparent text-primary-foreground shadow-lg shadow-primary/20' :
            'border-primary/10 hover:border-primary/40 hover:bg-primary/5'
          )}
        >
          Custom
        </button>
      </div>
    </div>
  );
}
