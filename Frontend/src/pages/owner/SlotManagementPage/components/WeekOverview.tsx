import { cn } from '@/lib/utils';
import { TimeSlot } from '@/types';
import { isPastBookableWindow } from '../utils';

type Props = {
  days: Date[];
  hours: number[];
  activeDayIndex: number;
  getSlotForHour: (date: Date, hour: number) => TimeSlot | undefined;
  onSelect: (index: number) => void;
};

type DayStats = { available: number; booked: number; blocked: number; total: number };

function computeDayStats(day: Date, hours: number[], getSlotForHour: Props['getSlotForHour']): DayStats {
  let available = 0, booked = 0, blocked = 0;
  for (const h of hours) {
    const slot = getSlotForHour(day, h);
    const status = slot?.status || 'NONE';
    const isLocked = status === 'BOOKED' || status === 'LOCKED';
    if (!isLocked && isPastBookableWindow(day, h)) continue; // elapsed marks don't count toward "today's picture"
    if (isLocked) booked++;
    else if (status === 'CLOSED' || status === 'FULL') blocked++;
    else available++;
  }
  return { available, booked, blocked, total: available + booked + blocked };
}

/**
 * Week-at-a-glance: one compact occupancy bar per day for the currently
 * selected turf, built entirely from the week's slots already fetched for
 * the day view (no extra request). Clicking a day both jumps the day view to
 * it and shows the breakdown — this is deliberately a summary, not a second
 * full timeline; a real per-slot 7-day grid would be unreadable on a phone.
 */
export function WeekOverview({ days, hours, activeDayIndex, getSlotForHour, onSelect }: Props) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => {
        const stats = computeDayStats(day, hours, getSlotForHour);
        const isActive = i === activeDayIndex;
        const isToday = day.toDateString() === new Date().toDateString();

        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(i)}
            className={cn(
              'flex flex-col gap-1.5 p-2 sm:p-3 rounded-xl border-2 text-left transition-all',
              isActive ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-primary/10'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                {day.toLocaleDateString('en', { weekday: 'short' })}
              </span>
              {isToday && <div className="w-1 h-1 rounded-full bg-primary" />}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-muted flex">
              {stats.total === 0 ? (
                <div className="w-full h-full bg-muted" />
              ) : (
                <>
                  {stats.available > 0 && <div className="bg-primary/50 h-full" style={{ width: `${(stats.available / stats.total) * 100}%` }} />}
                  {stats.booked > 0 && <div className="bg-destructive/60 h-full" style={{ width: `${(stats.booked / stats.total) * 100}%` }} />}
                  {stats.blocked > 0 && <div className="bg-muted-foreground/40 h-full" style={{ width: `${(stats.blocked / stats.total) * 100}%` }} />}
                </>
              )}
            </div>
            <span className="text-[10px] font-bold text-muted-foreground hidden sm:block">
              {stats.booked > 0 ? `${stats.booked} booked` : stats.total === 0 ? '—' : 'Open'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
