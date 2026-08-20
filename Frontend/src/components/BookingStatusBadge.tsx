import { cn } from '@/lib/utils';

export function BookingStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  return (
    <span className={cn(
      'text-[9px] px-3 py-1.5 rounded-full font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm border',
      s === 'CONFIRMED' ? 'bg-success/10 text-success border-success/20' :
      s === 'CANCELLED' ? 'bg-destructive/10 text-destructive border-destructive/20' :
      'bg-muted text-muted-foreground border-transparent'
    )}>
      <div className={cn('w-1.5 h-1.5 rounded-full',
        s === 'CONFIRMED' ? 'bg-success animate-pulse' :
        s === 'CANCELLED' ? 'bg-destructive' : 'bg-muted-foreground'
      )} />
      {status}
    </span>
  );
}
