import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  message?: string;
  onRetry: () => void;
};

/**
 * A genuine error state for a failed fetch — distinct from an empty state.
 * Several owner/admin pages used to swallow `isError` and fall through to
 * their "no data yet" empty state, so a failed request looked identical to
 * there simply being nothing to show.
 */
export function QueryErrorState({ message = "Couldn't load this — check your connection and try again.", onRetry }: Props) {
  return (
    <div className="border-2 border-dashed border-destructive/20 rounded-xl py-16 text-center">
      <AlertTriangle size={32} className="text-destructive/60 mx-auto mb-3" />
      <p className="text-muted-foreground font-medium mb-4">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="rounded-xl gap-2">
        <RefreshCw size={14} /> Retry
      </Button>
    </div>
  );
}
