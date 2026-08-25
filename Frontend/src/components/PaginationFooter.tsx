import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationFooterProps {
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

/**
 * The one pagination footer for every admin/owner list — text position
 * indicator plus icon prev/next buttons, correctly disabled at the
 * boundaries. Every paginated screen used to hand-roll this (and one,
 * AdminComplaintsPage, used text Prev/Next buttons instead) — this is the
 * single shared implementation they all render now.
 */
export function PaginationFooter({ page, pages, total, onPageChange, itemLabel = 'total' }: PaginationFooterProps) {
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pages} · {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
