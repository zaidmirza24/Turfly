import { cn } from '@/lib/utils';
import { BookingStatus } from '@/types';

/**
 * COMPLETED and NO_SHOW both mean the slot has passed, so neither should read
 * as live — but they aren't interchangeable: a completed session is a normal,
 * good outcome and a no-show is the venue holding a slot open for someone who
 * never arrived. Completed stays neutral; no-show is warned rather than
 * destructive, since nothing failed, it just needs to be visible.
 */
const STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  CONFIRMED: {
    chip: 'bg-success/10 text-success border-success/20',
    dot: 'bg-success animate-pulse',
    label: 'Confirmed',
  },
  COMPLETED: {
    chip: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground',
    label: 'Completed',
  },
  NO_SHOW: {
    chip: 'bg-warning/10 text-warning border-warning/20',
    dot: 'bg-warning',
    label: 'No-show',
  },
  CANCELLED: {
    chip: 'bg-destructive/10 text-destructive border-destructive/20',
    dot: 'bg-destructive',
    label: 'Cancelled',
  },
};

const FALLBACK = { chip: 'bg-muted text-muted-foreground border-transparent', dot: 'bg-muted-foreground', label: '' };

export function BookingStatusBadge({ status }: { status: BookingStatus | string }) {
  const key = String(status).toUpperCase();
  const style = STYLES[key] ?? { ...FALLBACK, label: String(status) };

  return (
    <span className={cn(
      'text-[10px] px-3 py-1.5 rounded-full font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm border',
      style.chip
    )}>
      <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}
