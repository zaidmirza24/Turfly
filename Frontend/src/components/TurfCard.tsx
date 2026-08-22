import { Link } from 'react-router-dom';
import { MapPin, Star, Heart } from 'lucide-react';
import { Turf } from '@/types';
import { Badge } from '@/components/ui/badge';
import { turfCoverImage } from '@/lib/imageUrl';
import { formatDistance } from '@/lib/geo';
import { useFavorites } from '@/hooks/useFavorites';
import { cn } from '@/lib/utils';
import { startingPricePerHour } from '@/lib/turfPricing';

interface TurfCardProps {
  turf: Turf;
}

export function TurfCard({ turf }: TurfCardProps) {
  const sports = turf.sportsType ?? [];
  const image = turfCoverImage(turf.images);
  const price = startingPricePerHour(turf);
  const hasWeekendPricing = turf.defaultWeekendPrice != null && turf.defaultWeekendPrice !== turf.defaultWeekdayPrice;
  const hasRating = (turf.reviewCount ?? 0) > 0;
  const distance = turf.distanceMeters != null ? formatDistance(turf.distanceMeters / 1000) : null;
  const { favoriteIds, toggleFavorite, isCustomer } = useFavorites();
  const isFavorite = favoriteIds.has(turf._id);

  return (
    <Link to={`/turfs/${turf._id}`} className="group block">
      <div className="rounded-[2rem] border bg-card overflow-hidden shadow-sm card-hover">
        <div className="aspect-[16/10] overflow-hidden relative">
          <img
            src={image}
            // Decorative: the turf's name is the adjacent heading, so
            // announcing it twice adds nothing for a screen reader.
            alt=""
            className="w-full h-full object-cover bg-muted group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
          <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
            {sports.slice(0, 2).map(s => (
              <Badge key={s} variant="secondary" className="glass text-[10px] uppercase font-bold px-3 py-1 rounded-full border-none">
                {s}
              </Badge>
            ))}
          </div>
          {isCustomer && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); toggleFavorite(turf._id); }}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className="absolute top-3 right-3 w-11 h-11 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform"
            >
              <Heart size={16} className={cn(isFavorite ? 'fill-destructive text-destructive' : 'text-foreground')} />
            </button>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors tracking-tight">{turf.name}</h3>
            {hasRating && (
              <span className="flex items-center gap-1 text-xs font-bold shrink-0">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {turf.avgRating?.toFixed(1)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-1 font-medium">
            <MapPin size={14} className="text-primary" />
            <span className="truncate">{turf.location}</span>
            {distance && <span className="shrink-0">· {distance}</span>}
          </div>
          <div className="flex items-center justify-end mt-5 pt-4 border-t">
            <div className="text-right">
              {hasWeekendPricing && <span className="block text-[9px] text-muted-foreground font-bold uppercase tracking-wide">From</span>}
              <span className="font-black text-xl text-primary tracking-tighter">₹{price}</span>
              <span className="text-[10px] text-muted-foreground font-bold uppercase ml-1">/hr</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
