import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { Paginated, Review } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploader } from '@/components/ImageUploader';
import { resolveImageUrl } from '@/lib/imageUrl';
import { Star, Loader2, MessageSquare, BadgeCheck, Flag, Pencil, Store, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const REVIEWS_PAGE_SIZE = 10;

function StarRating({ value, onChange, readOnly, size = 18 }: { value: number; onChange?: (v: number) => void; readOnly?: boolean; size?: number }) {
  return (
    <div className={cn('flex items-center', readOnly ? 'gap-0.5' : 'gap-0.5 -mx-1.5')}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          // Read-only stars are just a display, so a tight hit area doesn't
          // matter — but the interactive ones (rating input) get real
          // padding: at size=18 they were previously ~18px with 2px gaps,
          // an easy mis-tap target on a phone.
          className={readOnly ? 'cursor-default' : 'cursor-pointer p-2.5 touch-manipulation'}
        >
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} />
        </button>
      ))}
    </div>
  );
}

const FACILITIES: { key: 'turfQuality' | 'cleanliness' | 'staffBehavior'; label: string }[] = [
  { key: 'turfQuality', label: 'Turf quality' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'staffBehavior', label: 'Staff behavior' },
];

type FacilityRatings = Partial<Record<typeof FACILITIES[number]['key'], number>>;

function ReviewForm({
  initial, onSubmit, isSaving, submitLabel,
}: {
  initial?: Review;
  onSubmit: (data: { rating: number; comment: string; facilityRatings: FacilityRatings; images: string[] }) => void;
  isSaving: boolean;
  submitLabel: string;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [facilityRatings, setFacilityRatings] = useState<FacilityRatings>(initial?.facilityRatings ?? {});
  const [images, setImages] = useState<string[]>(initial?.images ?? []);

  return (
    <div className="bg-muted/30 rounded-2xl p-5 space-y-4">
      <div>
        <p className="font-semibold text-sm mb-2">Overall rating</p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="space-y-2">
        {FACILITIES.map(f => (
          <div key={f.key} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <StarRating
              value={facilityRatings[f.key] ?? 0}
              onChange={(v) => setFacilityRatings(prev => ({ ...prev, [f.key]: v }))}
              size={14}
            />
          </div>
        ))}
      </div>

      <Textarea
        placeholder="How was the turf, facilities, staff...?"
        value={comment}
        onChange={e => setComment(e.target.value)}
        rows={3}
        maxLength={500}
      />

      <div>
        <p className="text-xs font-medium mb-2 text-muted-foreground">Add photos (optional)</p>
        <ImageUploader value={images} onChange={setImages} max={4} disabled={isSaving} />
      </div>

      <Button
        size="sm"
        disabled={rating === 0 || isSaving}
        onClick={() => onSubmit({ rating, comment, facilityRatings, images })}
      >
        {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

export function ReviewsSection({ turfId, isOwnerOfTurf }: { turfId: string; isOwnerOfTurf?: boolean }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<Review[]>([]);

  useEffect(() => { setPage(1); }, [turfId]);

  const { data: reviewsResponse, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['reviews', turfId, page],
    queryFn: () => apiGet<Paginated<Review>>(`/reviews/${turfId}?page=${page}&limit=${REVIEWS_PAGE_SIZE}`),
  });

  useEffect(() => {
    if (!reviewsResponse) return;
    setAccumulated((prev) => (page === 1 ? reviewsResponse.data.items : [...prev, ...reviewsResponse.data.items]));
  }, [reviewsResponse, page]);

  const reviews = accumulated;
  const total = reviewsResponse?.data?.total ?? reviews.length;
  const hasMore = page < (reviewsResponse?.data?.pages ?? 1);
  const myReview = reviews.find(r => (typeof r.userId === 'object' ? r.userId._id : r.userId) === user?._id);

  const { data: eligibilityResponse } = useQuery({
    queryKey: ['review-eligibility', turfId, user?._id],
    queryFn: () => apiGet<{ canReview: boolean }>(`/reviews/${turfId}/eligibility`),
    enabled: isAuthenticated && user?.role === 'USER',
  });
  const canReview = eligibilityResponse?.data?.canReview ?? false;

  const invalidateAll = () => {
    // Resets back to page 1 and lets the query refetch — the accumulated,
    // client-side review list has no meaningful "patch this one page" story
    // once a new review is added or the set changes, so a full reload from
    // the top is simpler and correct.
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ['reviews', turfId] });
    queryClient.invalidateQueries({ queryKey: ['review-eligibility', turfId] });
    queryClient.invalidateQueries({ queryKey: ['turf', turfId] });
  };

  const submitMutation = useMutation({
    mutationFn: (data: { rating: number; comment: string; facilityRatings: FacilityRatings; images: string[] }) =>
      apiPost(`/reviews/${turfId}`, data),
    onSuccess: () => { toast.success('Thanks for your review!'); invalidateAll(); },
    onError: (error: Error) => toast.error(error.message || 'Failed to submit review'),
  });

  // Patches one review in the locally-accumulated list and returns a
  // snapshot for rollback — shared by edit/report/respond below since all
  // three know exactly what they're changing and can show it immediately.
  // Patches local state rather than the query cache because the list is now
  // paginated and accumulated client-side across pages, not a single cached
  // array the query owns.
  const patchReview = (reviewId: string, patch: Partial<Review>) => {
    const previous = accumulated;
    setAccumulated((old) => old.map(r => r._id === reviewId ? { ...r, ...patch } : r));
    return previous;
  };
  const rollbackReviews = (previous?: Review[]) => {
    if (previous) setAccumulated(previous);
  };

  const editMutation = useMutation({
    mutationFn: (data: { rating: number; comment: string; facilityRatings: FacilityRatings; images: string[] }) =>
      apiPatch(`/reviews/id/${editingId}`, data),
    onMutate: async (data) => {
      if (!editingId) return;
      const previous = patchReview(editingId, data);
      setEditingId(null);
      return { previous };
    },
    onSuccess: () => { toast.success('Review updated'); invalidateAll(); },
    onError: (error: Error, _data, context) => {
      rollbackReviews(context?.previous);
      toast.error(error.message || 'Failed to update review');
    },
  });

  const reportMutation = useMutation({
    mutationFn: (reviewId: string) => apiPost(`/reviews/id/${reviewId}/report`),
    onMutate: async (reviewId: string) => {
      const review = accumulated.find(r => r._id === reviewId);
      const previous = user
        ? patchReview(reviewId, { reportedBy: [...(review?.reportedBy ?? []), user._id] })
        : undefined;
      return { previous };
    },
    onSuccess: () => toast.success("Reported — our team will take a look"),
    onError: (error: Error, _reviewId, context) => {
      rollbackReviews(context?.previous);
      toast.error(error.message || 'Failed to report review');
    },
  });

  const respondMutation = useMutation({
    mutationFn: (reviewId: string) => apiPost(`/reviews/id/${reviewId}/response`, { text: responseText }),
    onMutate: async (reviewId: string) => {
      const previous = patchReview(reviewId, { ownerResponse: { text: responseText, respondedAt: new Date().toISOString() } });
      setRespondingId(null);
      setResponseText('');
      return { previous };
    },
    onSuccess: () => toast.success('Response posted'),
    onError: (error: Error, _reviewId, context) => {
      rollbackReviews(context?.previous);
      toast.error(error.message || 'Failed to post response');
    },
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
            {avgRating.toFixed(1)} <span className="text-muted-foreground font-normal">({total})</span>
          </span>
        )}
      </div>

      {canReview && !myReview && (
        <ReviewForm
          submitLabel="Submit Review"
          isSaving={submitMutation.isPending}
          onSubmit={(data) => submitMutation.mutate(data)}
        />
      )}

      {myReview && editingId === myReview._id && (
        <ReviewForm
          initial={myReview}
          submitLabel="Save Changes"
          isSaving={editMutation.isPending}
          onSubmit={(data) => editMutation.mutate(data)}
        />
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : isError ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-muted-foreground text-sm flex items-center justify-center gap-1.5">
            <AlertTriangle size={14} /> Couldn't load reviews.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reviews yet — be the first to play and review this turf.</p>
      ) : (
        <div className="space-y-5">
          {reviews.map(r => {
            const reviewer = typeof r.userId === 'object' ? r.userId.name : 'Player';
            const isMine = (typeof r.userId === 'object' ? r.userId._id : r.userId) === user?._id;
            const hasReported = user ? (r.reportedBy ?? []).includes(user._id) : false;
            const facilityEntries = FACILITIES.filter(f => r.facilityRatings?.[f.key]);

            if (isMine && editingId === r._id) return null; // form shown above instead

            return (
              <div key={r._id} className="border-b pb-5 last:border-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="truncate">{reviewer}</span>
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-success bg-success/10 rounded-full px-1.5 py-0.5 shrink-0" title="This reviewer has a confirmed booking at this turf">
                      <BadgeCheck size={11} /> Verified Booking
                    </span>
                  </span>
                  <StarRating value={r.rating} readOnly size={14} />
                </div>
                {r.comment && <p className="text-sm text-muted-foreground leading-relaxed mt-1">{r.comment}</p>}

                {facilityEntries.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                    {facilityEntries.map(f => (
                      <span key={f.key}>{f.label}: {r.facilityRatings![f.key]}/5</span>
                    ))}
                  </div>
                )}

                {(r.images ?? []).length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto">
                    {r.images!.map(img => (
                      <img key={img} src={resolveImageUrl(img, 'card')} alt="Review photo" className="w-20 h-20 rounded-lg object-cover shrink-0" loading="lazy" />
                    ))}
                  </div>
                )}

                {r.ownerResponse?.text && (
                  <div className="mt-3 bg-primary/5 border border-primary/10 rounded-xl p-3 text-xs">
                    <p className="font-bold flex items-center gap-1.5 mb-1"><Store size={12} /> Response from the venue</p>
                    <p className="text-muted-foreground">{r.ownerResponse.text}</p>
                  </div>
                )}

                {isOwnerOfTurf && !r.ownerResponse?.text && respondingId !== r._id && (
                  <Button variant="ghost" size="sm" className="gap-1.5 mt-2 h-7 text-xs" onClick={() => setRespondingId(r._id)}>
                    <Store size={12} /> Respond as venue
                  </Button>
                )}
                {isOwnerOfTurf && respondingId === r._id && (
                  <div className="mt-3 space-y-2">
                    <Textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={2} placeholder="Thank the reviewer or address their feedback..." />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!responseText.trim() || respondMutation.isPending} onClick={() => respondMutation.mutate(r._id)}>
                        {respondMutation.isPending ? <Loader2 className="animate-spin mr-1.5 h-3 w-3" /> : null}
                        Post response
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRespondingId(null); setResponseText(''); }}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 mt-2">
                  <p className="text-xs text-muted-foreground/70 mr-2">{new Date(r.createdAt).toLocaleDateString()}</p>
                  {isMine ? (
                    <Button variant="ghost" size="sm" className="h-10 gap-1 text-xs px-2.5" onClick={() => setEditingId(r._id)}>
                      <Pencil size={11} /> Edit
                    </Button>
                  ) : isAuthenticated && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 gap-1 text-xs px-2.5 text-muted-foreground"
                      disabled={hasReported || reportMutation.isPending}
                      onClick={() => reportMutation.mutate(r._id)}
                    >
                      <Flag size={11} /> {hasReported ? 'Reported' : 'Report'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setPage((p) => p + 1)}>
                {isFetching ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                Load more reviews
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
