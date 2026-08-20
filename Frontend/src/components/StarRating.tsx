import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  size?: number;
  showValue?: boolean;
  count?: number;
}

export function StarRating({ rating, size = 16, showValue = true, count }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={size}
          className={star <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}
        />
      ))}
      {showValue && <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>}
      {count !== undefined && <span className="text-sm text-muted-foreground">({count})</span>}
    </div>
  );
}
