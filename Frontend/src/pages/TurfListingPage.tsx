import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TurfCard } from '@/components/TurfCard';
import api from '@/lib/api';
import { Turf, Sport } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal, X, Search, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';

const sports: Sport[] = ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'volleyball'];
const sortOptions = [
  { value: 'rating', label: 'Rating' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

export default function TurfListingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [selectedSports, setSelectedSports] = useState<Sport[]>(
    searchParams.get('sport') ? [searchParams.get('sport') as Sport] : []
  );
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [sortBy, setSortBy] = useState('rating');

  const { data: turfsResponse, isLoading, error } = useQuery({
    queryKey: ['turfs'],
    queryFn: () => api.get('/turfs'),
  });

  const turfs = (turfsResponse as any)?.data || [];

  const toggleSport = (s: Sport) => {
    setSelectedSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const filteredTurfs = useMemo(() => {
    let result = [...turfs];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(q) || 
        t.location.toLowerCase().includes(q)
      );
    }
    if (selectedSports.length > 0) {
      result = result.filter(t => {
        const tSports = t.sportsType || t.sport || [];
        return tSports.some((s: string) => selectedSports.includes(s.toLowerCase() as Sport));
      });
    }
    
    result = result.filter(t => {
      const price = t.pricePerHour || 0;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    switch (sortBy) {
      case 'price-asc': result.sort((a, b) => (a.pricePerHour || 0) - (b.pricePerHour || 0)); break;
      case 'price-desc': result.sort((a, b) => (b.pricePerHour || 0) - (a.pricePerHour || 0)); break;
      default: result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return result;
  }, [turfs, search, selectedSports, priceRange, sortBy]);

  const clearFilters = () => {
    setSearch('');
    setSelectedSports([]);
    setPriceRange([0, 5000]);
    setSortBy('rating');
  };

  const hasFilters = search || selectedSports.length > 0 || priceRange[0] > 0 || priceRange[1] < 5000;

  const FilterContent = () => (
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
        <h3 className="font-medium mb-3">Price Range: ₹{priceRange[0]} - ₹{priceRange[1]}</h3>
        <Slider min={0} max={5000} step={100} value={priceRange} onValueChange={setPriceRange} />
      </div>
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
      {hasFilters && (
        <Button variant="outline" className="w-full" onClick={clearFilters}>
          <X size={14} className="mr-2" /> Clear All Filters
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search turfs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2 lg:hidden">
              <SlidersHorizontal size={16} /> Filters
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
            <div className="mt-6"><FilterContent /></div>
          </SheetContent>
        </Sheet>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="hidden sm:block h-10 px-3 rounded-lg border bg-background text-sm">
          {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedSports.map(s => (
            <Badge key={s} variant="secondary" className="gap-1 capitalize">
              {s} <X size={12} className="cursor-pointer" onClick={() => toggleSport(s)} />
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 border rounded-xl p-5">
            <h2 className="font-semibold mb-4">Filters</h2>
            <FilterContent />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-4">{filteredTurfs.length} turfs found</p>
          {filteredTurfs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">No turfs found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
              <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear Filters</Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredTurfs.map(turf => <TurfCard key={turf._id || turf.id} turf={turf} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
