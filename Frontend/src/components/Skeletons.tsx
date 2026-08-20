import { cn } from '@/lib/utils';

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden animate-pulse", className)}>
      <div className="aspect-[16/10] bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="flex justify-between">
          <div className="h-3 bg-muted rounded w-16" />
          <div className="h-4 bg-muted rounded w-12" />
        </div>
      </div>
    </div>
  );
}

export function SlotSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );
}
