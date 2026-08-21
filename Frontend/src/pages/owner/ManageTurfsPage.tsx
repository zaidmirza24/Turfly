import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Images } from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Sport } from '@/types';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageUploader, MAX_IMAGES } from '@/components/ImageUploader';
import { turfCoverImage } from '@/lib/imageUrl';

const allAmenities = ['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid', 'Air Conditioning', 'Cafeteria', 'Equipment Rental', 'Coaching', 'Pro Shop'];
const allSports: Sport[] = ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'volleyball'];

type NewTurfPayload = {
  name: string;
  location: string;
  pricePerHour: number;
  sportsType: string[];
  amenities: string[];
  description: string;
  images: string[];
};

export default function ManageTurfsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Turf whose photos are being edited, or null when the dialog is closed. */
  const [photoTurf, setPhotoTurf] = useState<Turf | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    pricePerHour: '',
    sportsType: [] as string[],
    amenities: [] as string[],
    description: '',
    images: [] as string[],
  });

  const { data: turfsResponse, isLoading } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => apiGet<Turf[]>('/turfs/my-turfs'),
  });

  const ownerTurfs = turfsResponse?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: NewTurfPayload) => apiPost<Turf>('/turfs', data),
    onSuccess: () => {
      toast.success('Turf submitted — an admin will review it before it goes live');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      setDialogOpen(false);
      setFormData({ name: '', location: '', pricePerHour: '', sportsType: [], amenities: [], description: '', images: [] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create turf');
    }
  });

  const photosMutation = useMutation({
    mutationFn: ({ turfId, images }: { turfId: string; images: string[] }) =>
      apiPatch<Turf>(`/turfs/${turfId}`, { images }),
    onSuccess: () => {
      toast.success('Photos updated');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      setPhotoTurf(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update photos'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.location || !formData.pricePerHour || formData.sportsType.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate({
      ...formData,
      pricePerHour: Number(formData.pricePerHour),
    });
  };

  const toggleSport = (sport: string) => {
    setFormData(prev => ({
      ...prev,
      sportsType: prev.sportsType.includes(sport) 
        ? prev.sportsType.filter(s => s !== sport)
        : [...prev.sportsType, sport]
    }));
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity) 
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Turfs</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus size={16} /> Add Turf</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Turf</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 mt-2">
              <div>
                <Label htmlFor="name">Turf Name *</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Green Arena Football" />
              </div>
              <div>
                <Label htmlFor="location">Location *</Label>
                <Input id="location" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Koramangala, Bangalore" />
              </div>
              <div>
                <Label htmlFor="price">Price per Hour (₹) *</Label>
                <Input id="price" type="number" value={formData.pricePerHour} onChange={e => setFormData({...formData, pricePerHour: e.target.value})} placeholder="1500" />
              </div>
              <div>
                <Label className="mb-2 block">Sports *</Label>
                <div className="flex flex-wrap gap-2">
                  {allSports.map(s => (
                    <Badge 
                      key={s} 
                      variant={formData.sportsType.includes(s) ? 'default' : 'outline'}
                      className="cursor-pointer capitalize"
                      onClick={() => toggleSport(s)}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Amenities</Label>
                <div className="grid grid-cols-2 gap-2">
                  {allAmenities.map(a => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors">
                      <Checkbox 
                        checked={formData.amenities.includes(a)}
                        onCheckedChange={() => toggleAmenity(a)}
                      /> 
                      {a}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe your turf..." rows={3} />
              </div>
              <div>
                <Label className="mb-2 block">Photos</Label>
                <ImageUploader
                  value={formData.images}
                  onChange={images => setFormData(prev => ({ ...prev, images }))}
                  disabled={createMutation.isPending}
                />
                <p className="text-[11px] text-muted-foreground mt-2">
                  The first photo is used as the cover image on search results.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                Save Turf
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {ownerTurfs.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-2xl text-muted-foreground">
            <p>You haven't added any turfs yet.</p>
            <Button variant="link" onClick={() => setDialogOpen(true)}>Add your first turf</Button>
          </div>
        ) : (
          ownerTurfs.map(turf => {
            const sports = turf.sportsType || [];
            const image = turfCoverImage(turf.images);
            return (
              <div key={turf._id} className="border rounded-xl p-4 bg-card flex gap-4 hover:shadow-sm transition-shadow">
                <img src={image} alt="" className="w-24 h-24 rounded-lg object-cover hidden sm:block bg-muted" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold truncate">{turf.name}</h3>
                      <p className="text-sm text-muted-foreground">{turf.location}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={turf.isActive ? 'default' : 'secondary'}>{turf.isActive ? 'Active' : 'Inactive'}</Badge>
                      <Badge
                        variant={turf.approvalStatus === 'APPROVED' ? 'default' : turf.approvalStatus === 'PENDING' ? 'secondary' : 'destructive'}
                        className="capitalize"
                      >
                        {(turf.approvalStatus || 'PENDING').toLowerCase()}
                      </Badge>
                      {turf.approvalStatus !== 'APPROVED' && (
                        <span className="text-[10px] text-muted-foreground text-right max-w-[9rem]">
                          {turf.approvalStatus === 'REJECTED'
                            ? 'Not listed publicly — contact support.'
                            : 'Awaiting review — not visible to players yet.'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sports.map(s => <Badge key={s} variant="outline" className="text-[10px] py-0 h-5 capitalize font-normal">{s}</Badge>)}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="font-bold text-primary">₹{turf.pricePerHour}/hr</span>
                    <span className="text-xs text-muted-foreground">
                      · {turf.images?.length
                        ? `${turf.images.length} photo${turf.images.length === 1 ? '' : 's'}`
                        : 'No photos yet'}
                    </span>
                  </div>
                </div>
                {/*
                  Full turf editing and deletion still aren't built (there is no
                  DELETE /api/turfs/:id). Photos are editable on their own
                  because a listing without them is the single biggest gap a new
                  owner hits; pricing and hours live in Slot Management.
                */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPhotoTurf(turf)}>
                    <Images size={13} aria-hidden="true" /> Photos
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => navigate('/owner/slots')}>
                    Manage slots
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!photoTurf} onOpenChange={open => !open && setPhotoTurf(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Photos — {photoTurf?.name}</DialogTitle>
          </DialogHeader>
          {photoTurf && (
            <PhotoManager
              key={photoTurf._id}
              turf={photoTurf}
              isSaving={photosMutation.isPending}
              onSave={images => photosMutation.mutate({ turfId: photoTurf._id, images })}
              onCancel={() => setPhotoTurf(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Photo editor for one existing turf.
 *
 * Split out and keyed by turf id so its draft state resets when a different
 * turf is opened. Changes are staged locally and only persisted on Save, so
 * closing the dialog doesn't half-apply an edit — but note that uploaded files
 * are stored server-side as soon as they're picked; anything not saved onto a
 * turf expires on its own (MongoDB TTL on Image.expiresAt).
 */
function PhotoManager({
  turf,
  isSaving,
  onSave,
  onCancel,
}: {
  turf: Turf;
  isSaving: boolean;
  onSave: (images: string[]) => void;
  onCancel: () => void;
}) {
  const [images, setImages] = useState<string[]>(turf.images ?? []);
  const isDirty = JSON.stringify(images) !== JSON.stringify(turf.images ?? []);

  return (
    <div className="space-y-4 mt-2">
      <ImageUploader value={images} onChange={setImages} max={MAX_IMAGES} disabled={isSaving} />
      <p className="text-[11px] text-muted-foreground">
        The first photo is the cover image shown on search results.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={() => onSave(images)} disabled={isSaving || !isDirty}>
          {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          Save photos
        </Button>
      </div>
    </div>
  );
}
