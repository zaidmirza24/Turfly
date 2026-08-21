import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { TurfCard } from '@/components/TurfCard';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/useFavorites';

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { favorites } = useFavorites();

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Favorites</h1>
      <p className="text-muted-foreground text-sm mb-8">Venues you've saved for quick access.</p>

      {favorites.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed rounded-2xl text-muted-foreground">
          <Heart size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No favorites yet</p>
          <p className="text-sm mt-1">Tap the heart on any turf to save it here.</p>
          <Button variant="link" className="mt-2" onClick={() => navigate('/turfs')}>Browse turfs</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {favorites.map(turf => <TurfCard key={turf._id} turf={turf} />)}
        </div>
      )}
    </div>
  );
}
