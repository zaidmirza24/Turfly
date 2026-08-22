import { formatSlotTime } from '@/lib/dateKey';

type Props = {
  windowStart: Date;
  windowEnd: Date;
  selectedStart: Date;
  selectedEnd: Date;
};

const TICK_COUNT = 5;

/**
 * Purely visual, non-interactive strip showing where the selected booking
 * sits within the day — deliberately not a draggable control. A pinch-sized
 * drag handle is exactly the "tiny timeline control" that's unusable on a
 * phone; picking the range via Duration + Start Time (or the Custom
 * dropdowns) already does the real work, this just confirms it at a glance.
 */
export function BookingTimeline({ windowStart, windowEnd, selectedStart, selectedEnd }: Props) {
  const total = windowEnd.getTime() - windowStart.getTime();
  if (total <= 0) return null;

  const pct = (t: number) => Math.min(100, Math.max(0, ((t - windowStart.getTime()) / total) * 100));

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = windowStart.getTime() + (total * i) / (TICK_COUNT - 1);
    return new Date(t);
  });

  const left = pct(selectedStart.getTime());
  const width = Math.max(2, pct(selectedEnd.getTime()) - left);

  return (
    <div className="space-y-2 select-none">
      <div className="relative h-8 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="absolute inset-y-0 gradient-primary rounded-full flex items-center justify-center"
          style={{ left: `${left}%`, width: `${width}%` }}
        >
          <span className="text-[9px] font-black text-primary-foreground uppercase tracking-widest px-1 truncate">
            {formatSlotTime(selectedStart)} – {formatSlotTime(selectedEnd)}
          </span>
        </div>
      </div>
      <div className="relative h-4 text-[9px] font-bold text-muted-foreground">
        {ticks.map((t, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${pct(t.getTime())}%` }}
          >
            {formatSlotTime(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
