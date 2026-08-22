import { AlertTriangle, Loader2, Pencil, RefreshCw, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimeSlot } from '@/types';
import { STATUS_META } from '../constants';
import { isPastBookableWindow } from '../utils';

type Props = {
  hours: number[];
  activeDay: Date;
  getSlotForHour: (date: Date, hour: number) => TimeSlot | undefined;
  selectedHours: number[];
  isMutating: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRowMouseDown: (hour: number) => void;
  onRowMouseEnter: (hour: number) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onEditPrice: (date: Date, hour: number) => void;
};

export function DayTimeline({
  hours,
  activeDay,
  getSlotForHour,
  selectedHours,
  isMutating,
  isLoading,
  isError,
  onRetry,
  onRowMouseDown,
  onRowMouseEnter,
  onTouchMove,
  onEditPrice,
}: Props) {
  return (
    <div className="relative glass border-primary/10 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/20 select-none">
      {isError ? (
        <div className="text-center py-16">
          <AlertTriangle size={32} className="text-destructive/60 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium mb-4">Couldn't load this week's schedule.</p>
          <Button variant="outline" size="sm" onClick={onRetry} className="rounded-xl gap-2">
            <RefreshCw size={14} /> Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div
          className={cn('divide-y divide-border transition-opacity', isMutating && 'opacity-70 pointer-events-none')}
          onTouchMove={onTouchMove}
        >
          {hours.map(h => {
            const slot = getSlotForHour(activeDay, h);
            const status = slot?.status || 'NONE';
            const isLocked = status === 'BOOKED' || status === 'LOCKED';
            // BOOKED stays BOOKED even once its hour has passed — that's a
            // real completed booking, worth still showing as what it was.
            // Everything else (AVAILABLE, NONE, CLOSED, FULL) that's elapsed
            // or too soon to ever be locked is relabeled PAST so the grid
            // never claims inventory is open when no customer could book it.
            const isPast = !isLocked && isPastBookableWindow(activeDay, h);
            const meta = isPast ? STATUS_META.PAST : (STATUS_META[status] || STATUS_META.NONE);
            const isSelected = selectedHours.includes(h);
            const isDisabled = isLocked || isPast;
            const timeLabel = `${h.toString().padStart(2, '0')}:00 – ${((h + 1) % 24).toString().padStart(2, '0')}:00`;

            return (
              <div
                key={h}
                data-hour={h}
                onMouseDown={() => onRowMouseDown(h)}
                onMouseEnter={() => onRowMouseEnter(h)}
                onTouchStart={() => onRowMouseDown(h)}
                className={cn('flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-4 transition-colors cursor-pointer',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                  isDisabled && 'cursor-not-allowed')}
              >
                <div className="w-14 sm:w-24 shrink-0 font-black text-[11px] sm:text-sm tracking-tighter text-muted-foreground">
                  {timeLabel}
                </div>

                <div className={cn('flex-1 h-11 rounded-2xl border-2 flex items-center px-2 sm:px-4 transition-all', meta.barClass)}>
                  <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full', meta.badgeClass)}>
                    {meta.label}
                  </span>
                  {status === 'BOOKED' && (
                    <span className="ml-auto text-[10px] font-bold text-destructive flex items-center gap-1" title="Customer booking">
                      <UserCheck size={12} /> <span className="hidden sm:inline">Customer booking</span>
                    </span>
                  )}
                </div>

                <div className="w-16 sm:w-24 shrink-0 text-right font-black text-sm sm:text-lg tracking-tighter flex items-center justify-end gap-1 sm:gap-2">
                  {slot ? <>₹{slot.price}</> : <span className="text-muted-foreground/30 text-sm">—</span>}
                  {!isDisabled && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditPrice(activeDay, h); }}
                      className="p-1.5 rounded-full hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
                      title="Edit price"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
