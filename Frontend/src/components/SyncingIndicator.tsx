import { Loader2 } from 'lucide-react';

type Props = {
  label: string;
  /** Adds a second, delayed overlapping ring for a busier "syncing" feel. */
  double?: boolean;
};

export function SyncingIndicator({ label, double }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        {double && <Loader2 className="w-12 h-12 animate-spin text-primary absolute top-0 left-0 [animation-delay:0.2s]" />}
      </div>
      <p className="text-muted-foreground font-black tracking-widest text-[10px] uppercase animate-pulse">{label}</p>
    </div>
  );
}
