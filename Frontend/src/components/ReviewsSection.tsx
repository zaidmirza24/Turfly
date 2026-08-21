import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Review } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

function StarRating({ value, onChange, readOnly, size = 18 }: { value: number; onChange?: (v: number) => void; readOnly?: boolean; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={readOnly ? 'cursor-default' : 'cursor-pointer'}
        >
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({ turfId }: { turfId: string }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const { data: reviewsResponse, isLoading } = useQuery({
    queryKey: ['reviews', turfId],
    queryFn: () => apiGet<Review[]>(`/reviews/${turfId}`),
  });
  const reviews = reviewsResponse?.data ?? [];

  const { data: eligibilityResponse } = useQuery({
    queryKey: ['review-eligibility', turfId, user?._id],
    queryFn: () => apiGet<{ canReview: boolean }>(`/reviews/${turfId}/eligibility`),
    enabled: isAuthenticated && user?.role === 'USER',
  });
  const canReview = eligibilityResponse?.data?.canReview ?? false;

  const submitMutation = useMutation({
    mutationFn: () => apiPost(`/reviews/${turfId}`, { rating, comment }),
    onSuccess: () => {
      toast.success('Thanks for your review!');
      setRating(0);
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['reviews', turfId] });
      queryClient.invalidateQueries({ queryKey: ['review-eligibility', turfId] });
      queryClient.invalidateQueries({ queryKey: ['turf', turfId] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to submit review'),
  });

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <section id="reviews" className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold flex items-center gap-3">
          <MessageSquare size={22} className="text-primary" /> Ratings &amp; Reviews
        </h2>
        {reviews.length > 0 && (
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <Star size={16} className="fill-amber-400 text-amber-400" />
            {avgRating.toFixed(1)} <span className="text-muted-foreground font-normal">({reviews.length})</span>
          </span>
        )}
      </div>

      {canReview && (
        <div className="bg-muted/30 rounded-2xl p-5 space-y-3">
          <p className="font-semibold text-sm">You played here — share your experience</p>
          <StarRating value={rating} onChange={setRating} />
          <Textarea
            placeholder="How was the turf, facilities, staff...?"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <Button
            size="sm"
            disabled={rating === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            Submit Review
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reviews yet — be the first to play and review this turf.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map(r => {
            const reviewer = typeof r.userId === 'object' ? r.userId.name : 'Player';
            return (
              <div key={r._id} className="border-b pb-4 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{reviewer}</span>
                  <StarRating value={r.rating} readOnly size={14} />
                </div>
                {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
