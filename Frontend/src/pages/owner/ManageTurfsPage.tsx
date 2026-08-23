import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Images, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Turf, Sport, VenueType } from '@/types';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageUploader, MAX_IMAGES } from '@/components/ImageUploader';
import { turfCoverImage, TURF_PLACEHOLDER_IMAGE } from '@/lib/imageUrl';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

const allAmenities = ['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid', 'Air Conditioning', 'Cafeteria', 'Equipment Rental', 'Coaching', 'Pro Shop'];
const allSports: Sport[] = ['football', 'cricket', 'badminton', 'tennis', 'basketball', 'volleyball'];
const venueTypeOptions: { value: VenueType; label: string }[] = [
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'INDOOR', label: 'Indoor' },
  { value: 'BOTH', label: 'Indoor & Outdoor' },
];

type Faq = { question: string; answer: string };

type TurfFormState = {
  name: string;
  location: string;
  pricePerHour: string;
  hasWeekendPricing: boolean;
  weekendPrice: string;
  sportsType: string[];
  amenities: string[];
  description: string;
  images: string[];
  venueType: VenueType;
  capacity: string;
  contactPhone: string;
  rules: string;
  faqs: Faq[];
};

const emptyForm = (): TurfFormState => ({
  name: '', location: '', pricePerHour: '', hasWeekendPricing: false, weekendPrice: '', sportsType: [], amenities: [], description: '', images: [],
  venueType: 'OUTDOOR', capacity: '', contactPhone: '', rules: '', faqs: [],
});

const turfToForm = (turf: Turf): TurfFormState => {
  // A weekend price only counts as a deliberate override when it actually
  // differs from the weekday rate — otherwise every turf saved before this
  // field existed (defaultWeekday/WeekendPrice both defaulted to the same
  // value) would reopen with the toggle already on.
  const hasWeekendPricing = turf.defaultWeekendPrice != null && turf.defaultWeekendPrice !== turf.defaultWeekdayPrice;
  return {
    name: turf.name,
    location: turf.location,
    pricePerHour: String(turf.defaultWeekdayPrice ?? turf.pricePerHour ?? ''),
    hasWeekendPricing,
    weekendPrice: hasWeekendPricing ? String(turf.defaultWeekendPrice) : '',
    sportsType: turf.sportsType ?? [],
    amenities: turf.amenities ?? [],
    description: turf.description ?? '',
    images: turf.images ?? [],
    venueType: turf.venueType ?? 'OUTDOOR',
    capacity: turf.capacity ? String(turf.capacity) : '',
    contactPhone: turf.contactPhone ?? '',
    rules: turf.rules ?? '',
    faqs: turf.faqs ?? [],
  };
};

function TurfForm({
  formData,
  setFormData,
  onSubmit,
  isSaving,
  submitLabel,
  showImages = true,
}: {
  formData: TurfFormState;
  setFormData: React.Dispatch<React.SetStateAction<TurfFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
  submitLabel: string;
  /**
   * Photos on an existing turf are edited exclusively through the dedicated
   * Photos dialog (see photosMutation below) — that dialog and this form used
   * to carry independent copies of `images`, seeded at different times, so
   * saving whichever one was opened last silently reverted the other's photo
   * changes. Hiding this section on the edit form (and dropping `images` from
   * its payload, see toPayload) makes the Photos dialog the only writer.
   */
  showImages?: boolean;
}) {
  const toggleSport = (sport: string) => {
    setFormData(prev => ({
      ...prev,
      sportsType: prev.sportsType.includes(sport) ? prev.sportsType.filter(s => s !== sport) : [...prev.sportsType, sport],
    }));
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity) ? prev.amenities.filter(a => a !== amenity) : [...prev.amenities, amenity],
    }));
  };

  const updateFaq = (i: number, field: keyof Faq, value: string) => {
    setFormData(prev => ({ ...prev, faqs: prev.faqs.map((f, idx) => idx === i ? { ...f, [field]: value } : f) }));
  };
  const removeFaq = (i: number) => setFormData(prev => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== i) }));
  const addFaq = () => setFormData(prev => ({ ...prev, faqs: [...prev.faqs, { question: '', answer: '' }] }));

  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
      <div>
        <Label htmlFor="name">Turf Name *</Label>
        <Input id="name" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Green Arena Football" />
      </div>
      <div>
        <Label htmlFor="location">Location *</Label>
        <Input id="location" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Koramangala, Bangalore" />
        <p className="text-[11px] text-muted-foreground mt-1">Used to place this turf on the map — be specific (area, city).</p>
      </div>
      <div>
        <Label htmlFor="price">Price per Hour (₹) *</Label>
        <Input id="price" type="number" min={1} value={formData.pricePerHour} onChange={e => setFormData(p => ({ ...p, pricePerHour: e.target.value }))} placeholder="1500" />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={formData.hasWeekendPricing}
            onCheckedChange={checked => setFormData(p => ({ ...p, hasWeekendPricing: checked === true }))}
          />
          Charge a different price on weekends?
        </label>
        {formData.hasWeekendPricing && (
          <div className="mt-2">
            <Label htmlFor="weekendPrice">Weekend Price per Hour (₹) *</Label>
            <Input
              id="weekendPrice"
              type="number"
              min={1}
              value={formData.weekendPrice}
              onChange={e => setFormData(p => ({ ...p, weekendPrice: e.target.value }))}
              placeholder="2000"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Applied to Saturdays and Sundays instead of the standard rate above.</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="capacity">Capacity (players)</Label>
          <Input id="capacity" type="number" min={1} value={formData.capacity} onChange={e => setFormData(p => ({ ...p, capacity: e.target.value }))} placeholder="10" />
        </div>
        <div>
          <Label htmlFor="phone">Contact Phone</Label>
          <Input id="phone" type="tel" value={formData.contactPhone} onChange={e => setFormData(p => ({ ...p, contactPhone: e.target.value }))} placeholder="9876543210" />
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Venue Type</Label>
        <div className="flex flex-wrap gap-2">
          {venueTypeOptions.map(v => (
            <Badge
              key={v.value}
              variant={formData.venueType === v.value ? 'default' : 'outline'}
              className="cursor-pointer px-3.5 py-2 text-sm"
              onClick={() => setFormData(p => ({ ...p, venueType: v.value }))}
            >
              {v.label}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Sports *</Label>
        <div className="flex flex-wrap gap-2">
          {allSports.map(s => (
            <Badge key={s} variant={formData.sportsType.includes(s) ? 'default' : 'outline'} className="cursor-pointer capitalize px-3.5 py-2 text-sm" onClick={() => toggleSport(s)}>
              {s}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Amenities</Label>
        <div className="grid grid-cols-2 gap-2">
          {allAmenities.map(a => (
            <label key={a} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-2.5 rounded transition-colors">
              <Checkbox checked={formData.amenities.includes(a)} onCheckedChange={() => toggleAmenity(a)} />
              {a}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea id="desc" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Describe your turf..." rows={3} />
      </div>
      <div>
        <Label htmlFor="rules">House Rules</Label>
        <Textarea id="rules" value={formData.rules} onChange={e => setFormData(p => ({ ...p, rules: e.target.value }))} placeholder="e.g. Non-marking shoes only, no outside food..." rows={3} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>FAQs</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={addFaq}>
            <Plus size={13} /> Add
          </Button>
        </div>
        <div className="space-y-3">
          {formData.faqs.map((f, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2 relative">
              <button type="button" onClick={() => removeFaq(i)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" aria-label="Remove FAQ">
                <X size={14} />
              </button>
              <Input placeholder="Question" value={f.question} onChange={e => updateFaq(i, 'question', e.target.value)} className="pr-8" />
              <Textarea placeholder="Answer" value={f.answer} onChange={e => updateFaq(i, 'answer', e.target.value)} rows={2} />
            </div>
          ))}
        </div>
      </div>
      {showImages && (
        <div>
          <Label className="mb-2 block">Photos</Label>
          <ImageUploader value={formData.images} onChange={images => setFormData(prev => ({ ...prev, images }))} disabled={isSaving} />
          <p className="text-[11px] text-muted-foreground mt-2">The first photo is used as the cover image on search results.</p>
        </div>
      )}
      {/*
        Sticky rather than a flex-column restructure of DialogContent (which
        is shared by every dialog in the app): a long form — chips, the
        amenity grid, repeatable FAQs, the photo uploader — otherwise leaves
        Save reachable only by scrolling past all of it, worse with the
        mobile keyboard eating vertical space.
      */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 border-t bg-background">
        <Button type="submit" className="w-full" disabled={isSaving}>
          {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default function ManageTurfsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPending = user?.approvalStatus === 'PENDING';
  const isRejected = user?.approvalStatus === 'REJECTED';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTurf, setEditingTurf] = useState<Turf | null>(null);
  /** Turf whose photos are being edited, or null when the dialog is closed. */
  const [photoTurf, setPhotoTurf] = useState<Turf | null>(null);

  const [formData, setFormData] = useState<TurfFormState>(emptyForm());
  const [editFormData, setEditFormData] = useState<TurfFormState>(emptyForm());

  const { data: turfsResponse, isLoading } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => apiGet<Turf[]>('/turfs/my-turfs'),
  });

  const ownerTurfs = turfsResponse?.data ?? [];

  // `includeImages` is false for edits: photos on an existing turf are only
  // ever written by the dedicated Photos dialog (photosMutation) — see the
  // showImages doc comment on TurfForm for why sending `images` here as well
  // would silently revert whatever that dialog last saved.
  const toPayload = (data: TurfFormState, includeImages = true) => {
    const weekdayPrice = Number(data.pricePerHour);
    const weekendPrice = data.hasWeekendPricing && data.weekendPrice ? Number(data.weekendPrice) : weekdayPrice;
    const { hasWeekendPricing: _hasWeekendPricing, weekendPrice: _weekendPrice, images, ...rest } = data;
    return {
      ...rest,
      ...(includeImages ? { images } : {}),
      pricePerHour: weekdayPrice,
      defaultWeekdayPrice: weekdayPrice,
      defaultWeekendPrice: weekendPrice,
      capacity: data.capacity ? Number(data.capacity) : undefined,
      faqs: data.faqs.filter(f => f.question.trim() && f.answer.trim()),
    };
  };

  const createMutation = useMutation({
    mutationFn: (data: TurfFormState) => apiPost<Turf>('/turfs', toPayload(data)),
    onSuccess: () => {
      toast.success('Turf submitted — an admin will review it before it goes live');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      setDialogOpen(false);
      setFormData(emptyForm());
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create turf'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ turfId, data }: { turfId: string; data: TurfFormState }) => apiPatch<Turf>(`/turfs/${turfId}`, toPayload(data, false)),
    onSuccess: (_res, { turfId }) => {
      toast.success('Turf updated');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      // A price edit here also repriced this turf's existing slots
      // server-side, so any slot list already cached in this tab (the owner's
      // own slot grid, or this turf's public detail page) needs to be thrown
      // away too instead of showing the pre-edit price until it naturally
      // goes stale.
      queryClient.invalidateQueries({ queryKey: ['slots-range', turfId] });
      queryClient.invalidateQueries({ queryKey: ['slots', turfId] });
      queryClient.invalidateQueries({ queryKey: ['slots-month', turfId] });
      queryClient.invalidateQueries({ queryKey: ['turf', turfId] });
      setEditingTurf(null);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update turf'),
  });

  const photosMutation = useMutation({
    mutationFn: ({ turfId, images }: { turfId: string; images: string[] }) =>
      apiPatch<Turf>(`/turfs/${turfId}`, { images }),
    onMutate: async ({ turfId, images }) => {
      await queryClient.cancelQueries({ queryKey: ['my-turfs'] });
      const previous = queryClient.getQueryData<{ data: Turf[] }>(['my-turfs']);
      queryClient.setQueryData<{ data: Turf[] } | undefined>(['my-turfs'], (old) =>
        old ? { ...old, data: old.data.map(t => t._id === turfId ? { ...t, images } : t) } : old
      );
      setPhotoTurf(null);
      return { previous };
    },
    onSuccess: () => toast.success('Photos updated'),
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['my-turfs'], context.previous);
      toast.error(error.message || 'Failed to update photos');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['my-turfs'] }),
  });

  const isFormValid = (data: TurfFormState) =>
    !!data.name && !!data.location && !!data.pricePerHour && data.sportsType.length > 0 &&
    (!data.hasWeekendPricing || !!data.weekendPrice);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid(formData)) {
      toast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTurf) return;
    if (!isFormValid(editFormData)) {
      toast.error('Please fill in all required fields');
      return;
    }
    updateMutation.mutate({ turfId: editingTurf._id, data: editFormData });
  };

  const openEdit = (turf: Turf) => {
    setEditFormData(turfToForm(turf));
    setEditingTurf(turf);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div>
      {(isPending || isRejected) && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 mb-6 ${isRejected ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'}`}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">
            {isRejected
              ? 'Your owner account was rejected. Contact support if you think this is a mistake — you cannot list a turf until this is resolved.'
              : 'Your owner account is awaiting admin approval. You can browse this page, but you cannot add a new turf until an admin approves your account.'}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Turfs</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!(isPending || isRejected)) setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={isPending || isRejected}><Plus size={16} /> Add Turf</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Turf</DialogTitle></DialogHeader>
            <TurfForm formData={formData} setFormData={setFormData} onSubmit={handleSave} isSaving={createMutation.isPending} submitLabel="Save Turf" />
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
                <img
                  src={image}
                  alt=""
                  className="w-24 h-24 rounded-lg object-cover hidden sm:block bg-muted"
                  loading="lazy"
                  onError={(e) => {
                    if (e.currentTarget.src !== TURF_PLACEHOLDER_IMAGE) e.currentTarget.src = TURF_PLACEHOLDER_IMAGE;
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{turf.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{turf.location}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
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
                  There is no DELETE /api/turfs/:id, so deletion still isn't
                  offered here. Full detail editing (this dialog) and photos
                  are separate actions for the same reason the photo dialog
                  was split out originally — a photo-only change shouldn't
                  risk touching the rest of the listing.
                */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openEdit(turf)}>
                    <Pencil size={13} aria-hidden="true" /> Edit
                  </Button>
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

      <Dialog open={!!editingTurf} onOpenChange={open => !open && setEditingTurf(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit — {editingTurf?.name}</DialogTitle></DialogHeader>
          <TurfForm formData={editFormData} setFormData={setEditFormData} onSubmit={handleUpdate} isSaving={updateMutation.isPending} submitLabel="Save Changes" showImages={false} />
        </DialogContent>
      </Dialog>

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
