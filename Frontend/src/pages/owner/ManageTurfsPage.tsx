import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Sport } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';

const allAmenities = ['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid', 'Air Conditioning', 'Cafeteria', 'Equipment Rental', 'Coaching', 'Pro Shop'];
const allSports: Sport[] = ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'volleyball'];

export default function ManageTurfsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    pricePerHour: '',
    sportsType: [] as string[],
    amenities: [] as string[],
    description: '',
  });

  const { data: turfsResponse, isLoading } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => api.get('/turfs/my-turfs'),
  });

  const ownerTurfs = (turfsResponse as any)?.data as Turf[] || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/turfs', data),
    onSuccess: () => {
      toast.success('Turf created successfully');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      setDialogOpen(false);
      setFormData({ name: '', location: '', pricePerHour: '', sportsType: [], amenities: [], description: '' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create turf');
    }
  });

  const handleSave = async (e: React.FormEvent) => {
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
            const sports = turf.sportsType || turf.sport || [];
            const image = turf.images?.[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800';
            return (
              <div key={turf._id || turf.id} className="border rounded-xl p-4 bg-card flex gap-4 hover:shadow-sm transition-shadow">
                <img src={image} alt={turf.name} className="w-24 h-24 rounded-lg object-cover hidden sm:block" />
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
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sports.map(s => <Badge key={s} variant="outline" className="text-[10px] py-0 h-5 capitalize font-normal">{s}</Badge>)}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="font-bold text-primary">₹{turf.pricePerHour}/hr</span>
                    <span className="text-xs text-muted-foreground">• {turf.rating || 4.5}★ ({turf.reviewCount || 0})</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toast.info('Edit coming soon')}><Pencil size={14} /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => toast.info('Delete coming soon')}><Trash2 size={14} /></Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
