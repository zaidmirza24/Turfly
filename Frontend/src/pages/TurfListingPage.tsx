import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { TurfCard } from '@/components/TurfCard';
import { CardSkeleton } from '@/components/Skeletons';
import { apiGet } from '@/lib/api';
import { Turf, Sport, VenueType, Paginated } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal, X, Search, Loader2, MapPin, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { getCachedPosition, getCurrentPosition, Coords } from '@/lib/geo';
import { toast } from 'sonner';

const sports: Sport[] = ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'volleyball'];
const venueTypes: { value: VenueType; label: string }[] = [
  { value: 'INDOOR', label: 'Indoor' },
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'BOTH', label: 'Indoor & Outdoor' },
];
const amenityOptions = ['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid', 'Air Conditioning', 'Cafeteria', 'Equipment Rental', 'Coaching', 'Pro Shop'];

// Upper bound of the price filter. Turfs priced above this would be filtered
// out entirely, so the slider's max doubles as "no upper limit" at the top.
const MAX_PRICE = 5000;
const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'popularity', label: 'Most booked' },
] as const;

type SortValue = (typeof sortOptions)[number]['value'];
const DEFAULT_SORT: SortValue = 'newest';

type FilterContentProps = {
  selectedSports: Sport[];
  toggleSport: (s: Sport) => void;
  venueType: VenueType | '';
  setVenueType: (v: VenueType | '' | ((prev: VenueType | '') => VenueType | '')) => void;
  priceRange: number[];
  setPriceRange: (v: number[]) => void;
  minRating: number;
  setMinRating: (v: number) => void;
  selectedAmenities: string[];
  toggleAmenity: (a: string) => void;
  availableNow: boolean;
  setAvailableNow: (v: boolean) => void;
  near: Coords | null;
  setNear: (v: Coords | null) => void;
  useMyLocation: () => void;
  locating: boolean;
  sortBy: SortValue;
  setSortBy: (v: SortValue) => void;
  hasFilters: boolean;
  clearFilters: () => void;
};

// Hoisted to module scope (rather than defined inside TurfListingPage) so it
// keeps a stable component identity across renders — nested inside the page
// component, a re-render on every keystroke/filter toggle would give React a
// "new" component type each time and force a full unmount+remount of the
// filter UI, which is exactly the subtree the mobile Sheet below relies on
// staying mounted while the user is interacting with it.
function FilterContent({
  selectedSports, toggleSport, venueType, setVenueType, priceRange, setPriceRange,
  minRating, setMinRating, selectedAmenities, toggleAmenity, availableNow, setAvailableNow,
  near, setNear, useMyLocation, locating, sortBy, setSortBy, hasFilters, clearFilters,
}: FilterContentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-3">Sport Type</h3>
        <div className="flex flex-wrap gap-2">
          {sports.map(s => (
            <Badge
              key={s}
              variant={selectedSports.includes(s) ? 'default' : 'outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggleSport(s)}
            >
              {s}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">Venue Type</h3>
        <div className="flex flex-wrap gap-2">
          {venueTypes.map(v => (
            <Badge
              key={v.value}
              variant={venueType === v.value ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setVenueType(prev => prev === v.value ? '' : v.value)}
            >
              {v.label}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">
          Price Range: ₹{priceRange[0]} – ₹{priceRange[1]}{priceRange[1] >= MAX_PRICE ? '+' : ''}
        </h3>
        <Slider min={0} max={MAX_PRICE} step={100} value={priceRange} onValueChange={setPriceRange} aria-label="Price range per hour" />
      </div>

      <div>
        <h3 className="font-medium mb-3">Minimum Rating</h3>
        <div className="flex gap-2">
          {[0, 3, 4, 4.5].map(r => (
            <Badge
              key={r}
              variant={minRating === r ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setMinRating(r)}
            >
              {r === 0 ? 'Any' : `${r}+ ★`}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">Amenities</h3>
        <div className="grid grid-cols-2 gap-2">
          {amenityOptions.map(a => (
            <label key={a} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2.5 rounded transition-colors">
              <Checkbox checked={selectedAmenities.includes(a)} onCheckedChange={() => toggleAmenity(a)} />
              {a}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={availableNow} onCheckedChange={(v) => setAvailableNow(!!v)} />
          <Zap size={14} className="text-primary" /> Available now
        </label>
      </div>

      <div>
        <h3 className="font-medium mb-3">Distance</h3>
        <Button variant={near ? 'secondary' : 'outline'} size="sm" className="w-full gap-2" onClick={near ? () => setNear(null) : useMyLocation} disabled={locating}>
          {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {near ? 'Sorting by distance — clear' : 'Use my location'}
        </Button>
      </div>

      {!near && (
        <div>
          <h3 className="font-medium mb-3">Sort By</h3>
          <div className="space-y-2">
            {sortOptions.map(o => (
              <Button key={o.value} variant={sortBy === o.value ? 'secondary' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setSortBy(o.value)}>
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {hasFilters && (
        <Button variant="outline" className="w-full" onClick={clearFilters}>
          <X size={14} className="mr-2" /> Clear All Filters
        </Button>
      )}
    </div>
  );
}

export default function TurfListingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSports, setSelectedSports] = useState<Sport[]>(
    searchParams.get('sport') ? [searchParams.get('sport') as Sport] : []
  );
  const [venueType, setVenueType] = useState<VenueType | ''>('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState([0, MAX_PRICE]);
  const [minRating, setMinRating] = useState(0);
  const [availableNow, setAvailableNow] = useState(searchParams.get('availableNow') === 'true');
  const [sortBy, setSortBy] = useState<SortValue>(DEFAULT_SORT);
  const [near, setNear] = useState<Coords | null>(getCachedPosition());
  const [locating, setLocating] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Fetches the full catalog once for client-side name/location autocomplete —
  // the marketplace-sized turf count here makes this cheap; a dedicated
  // /turfs/search endpoint would only be worth it at a much larger catalog.
  const { data: allTurfsResponse } = useQuery({
    queryKey: ['turfs-all-names'],
    queryFn: () => apiGet<Turf[]>('/turfs?limit=200'),
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (allTurfsResponse?.data ?? [])
      .filter((t) => t.name.toLowerCase().includes(q) || t.location.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, allTurfsResponse]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    // Name search happens client-side below (see `visibleTurfs`) so it can
    // match on turf name too — the server's `location` filter only matches
    // the location field, and combining both server-side would need an $or
    // the public listing filter doesn't build today.
    if (selectedSports.length) params.set('sportsType', selectedSports.join(','));
    if (venueType) params.set('venueType', venueType);
    if (selectedAmenities.length) params.set('amenities', selectedAmenities.join(','));
    if (priceRange[0] > 0) params.set('minPrice', String(priceRange[0]));
    if (priceRange[1] < MAX_PRICE) params.set('maxPrice', String(priceRange[1]));
    if (minRating > 0) params.set('minRating', String(minRating));
    if (availableNow) params.set('availableNow', 'true');
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lng', String(near.lng));
    } else {
      params.set('sortBy', sortBy);
    }
    return params.toString();
  }, [search, selectedSports, venueType, selectedAmenities, priceRange, minRating, availableNow, near, sortBy]);

  // Server-side pages of PAGE_SIZE turfs, accumulated as "Load more" is
  // pressed — a card grid like this reads as a feed, so load-more fits
  // better than page-number controls while still bounding each request.
  const PAGE_SIZE = 24;
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<Turf[]>([]);

  useEffect(() => { setPage(1); }, [queryParams]);

  const { data: turfsResponse, isLoading, isFetching, error } = useQuery({
    queryKey: ['turfs', queryParams, page],
    queryFn: () => apiGet<Paginated<Turf>>(`/turfs?${queryParams}&page=${page}&limit=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!turfsResponse) return;
    setAccumulated((prev) => (page === 1 ? turfsResponse.data.items : [...prev, ...turfsResponse.data.items]));
  }, [turfsResponse, page]);

  const total = turfsResponse?.data?.total ?? 0;
  const totalPages = turfsResponse?.data?.pages ?? 1;
  const hasMore = page < totalPages;

  const visibleTurfs = useMemo(() => {
    if (!search.trim()) return accumulated;
    const q = search.toLowerCase();
    return accumulated.filter(t => t.name.toLowerCase().includes(q) || t.location.toLowerCase().includes(q));
  }, [accumulated, search]);

  const toggleSport = (s: Sport) => {
    setSelectedSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };
  const toggleAmenity = (a: string) => {
    setSelectedAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentPosition();
      setNear(coords);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get your location');
    } finally {
      setLocating(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedSports([]);
    setVenueType('');
    setSelectedAmenities([]);
    setPriceRange([0, MAX_PRICE]);
    setMinRating(0);
    setAvailableNow(false);
    setNear(null);
    setSortBy(DEFAULT_SORT);
    setSearchParams({}, { replace: true });
  };

  const hasFilters = !!search || selectedSports.length > 0 || !!venueType || selectedAmenities.length > 0 ||
    priceRange[0] > 0 || priceRange[1] < MAX_PRICE || minRating > 0 || availableNow || !!near;

  const filterProps: FilterContentProps = {
    selectedSports, toggleSport, venueType, setVenueType, priceRange, setPriceRange,
    minRating, setMinRating, selectedAmenities, toggleAmenity, availableNow, setAvailableNow,
    near, setNear, useMyLocation, locating, sortBy, setSortBy, hasFilters, clearFilters,
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-destructive font-medium">Failed to load turfs</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md" ref={searchBoxRef}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or locality..."
            aria-label="Search turfs by name or location"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            className="pl-9"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-popover border rounded-lg shadow-lg z-20 overflow-hidden">
              {suggestions.map(t => (
                <button
                  key={t._id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col"
                  onClick={() => { setSearch(t.name); setShowSuggestions(false); }}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.location}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2 lg:hidden">
              <SlidersHorizontal size={16} /> Filters
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
            <div className="mt-6 overflow-y-auto max-h-[calc(100vh-6rem)] pr-1"><FilterContent {...filterProps} /></div>
          </SheetContent>
        </Sheet>
        {!near && (
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortValue)}
            aria-label="Sort turfs"
            className="hidden sm:block h-10 px-3 rounded-lg border bg-background text-sm"
          >
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedSports.map(s => (
            <Badge key={s} variant="secondary" className="gap-1 capitalize">
              {s}
              <button type="button" onClick={() => toggleSport(s)} aria-label={`Remove ${s} filter`} className="ml-0.5"><X size={12} /></button>
            </Badge>
          ))}
          {venueType && (
            <Badge variant="secondary" className="gap-1">
              {venueTypes.find(v => v.value === venueType)?.label}
              <button type="button" onClick={() => setVenueType('')} aria-label="Remove venue type filter" className="ml-0.5"><X size={12} /></button>
            </Badge>
          )}
          {selectedAmenities.map(a => (
            <Badge key={a} variant="secondary" className="gap-1">
              {a}
              <button type="button" onClick={() => toggleAmenity(a)} aria-label={`Remove ${a} filter`} className="ml-0.5"><X size={12} /></button>
            </Badge>
          ))}
          {minRating > 0 && (
            <Badge variant="secondary" className="gap-1">
              {minRating}+ ★
              <button type="button" onClick={() => setMinRating(0)} aria-label="Remove rating filter" className="ml-0.5"><X size={12} /></button>
            </Badge>
          )}
          {availableNow && (
            <Badge variant="secondary" className="gap-1">
              Available now
              <button type="button" onClick={() => setAvailableNow(false)} aria-label="Remove available now filter" className="ml-0.5"><X size={12} /></button>
            </Badge>
          )}
          {near && (
            <Badge variant="secondary" className="gap-1">
              Near me
              <button type="button" onClick={() => setNear(null)} aria-label="Remove distance filter" className="ml-0.5"><X size={12} /></button>
            </Badge>
          )}
        </div>
      )}

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 border rounded-xl p-5 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <h2 className="font-semibold mb-4">Filters</h2>
            <FilterContent {...filterProps} />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4" role="status" aria-live="polite">
                {search.trim()
                  ? `${visibleTurfs.length} ${visibleTurfs.length === 1 ? 'turf' : 'turfs'} found`
                  : `${accumulated.length} of ${total} ${total === 1 ? 'turf' : 'turfs'}`}
              </p>
              {visibleTurfs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-lg font-medium">{hasFilters ? 'No turfs match your filters' : 'No turfs listed yet'}</p>
                  <p className="text-sm mt-1">
                    {hasFilters ? 'Try widening the price range or clearing a filter.' : 'New venues appear here once an admin approves them.'}
                  </p>
                  {hasFilters && <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear Filters</Button>}
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {visibleTurfs.map(turf => <TurfCard key={turf._id} turf={turf} />)}
                  </div>
                  {!search.trim() && hasMore && (
                    <div className="flex justify-center mt-8">
                      <Button variant="outline" disabled={isFetching} onClick={() => setPage((p) => p + 1)}>
                        {isFetching ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                        Load more turfs
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
