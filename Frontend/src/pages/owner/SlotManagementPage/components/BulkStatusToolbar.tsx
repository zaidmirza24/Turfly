import { Ban, CheckCircle2, Loader2, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlotAction } from '../types';

type Props = {
  selectedHours: number[];
  isPending: boolean;
  onApply: (status: SlotAction) => void;
  onClear: () => void;
};

export function BulkStatusToolbar({ selectedHours, isPending, onApply, onClear }: Props) {
  if (selectedHours.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-30 glass border-primary/20 rounded-3xl sm:rounded-full shadow-2xl px-3 py-2 flex flex-wrap items-center justify-center gap-2 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4">
      <span className="text-xs font-black px-3 text-muted-foreground">
        {isPending ? <Loader2 size={14} className="animate-spin inline" /> : `${selectedHours.length} hour${selectedHours.length > 1 ? 's' : ''}`}
      </span>
      <Button
        size="sm"
        className="rounded-full h-9 px-3 sm:px-4 bg-primary/10 text-primary hover:bg-primary/20 gap-1.5 font-bold"
        disabled={isPending}
        onClick={() => onApply('AVAILABLE')}
      >
        <CheckCircle2 size={14} /> Available
      </Button>
      <Button
        size="sm"
        className="rounded-full h-9 px-3 sm:px-4 bg-muted text-muted-foreground hover:bg-muted/70 gap-1.5 font-bold"
        disabled={isPending}
        onClick={() => onApply('CLOSED')}
      >
        <Ban size={14} /> Closed
      </Button>
      <Button
        size="sm"
        className="rounded-full h-9 px-3 sm:px-4 bg-warning/10 text-warning hover:bg-warning/20 gap-1.5 font-bold"
        disabled={isPending}
        onClick={() => onApply('FULL')}
      >
        <UserCheck size={14} /> Full
      </Button>
      <button
        onClick={onClear}
        disabled={isPending}
        className="p-2 rounded-full hover:bg-muted text-muted-foreground ml-1 disabled:opacity-40"
        title="Clear selection"
      >
        <X size={16} />
      </button>
    </div>
  );
}
