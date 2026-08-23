import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { ComplaintCategory } from '@/types';

const CATEGORY_OPTIONS: { value: ComplaintCategory; label: string }[] = [
  { value: 'PAYMENT', label: 'Payment issue' },
  { value: 'BOOKING', label: 'Booking issue' },
  { value: 'TURF_QUALITY', label: 'Turf quality' },
  { value: 'BEHAVIOR', label: 'Behavior / conduct' },
  { value: 'OTHER', label: 'Other' },
];

interface ComplaintDialogProps {
  bookingId?: string;
  turfId?: string;
  trigger?: React.ReactNode;
}

export function ComplaintDialog({ bookingId, turfId, trigger }: ComplaintDialogProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ComplaintCategory>('BOOKING');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiPost('/complaints', { bookingId, turfId, category, description }),
    onSuccess: () => {
      toast.success("Your report has been submitted — an admin will review it");
      setOpen(false);
      setDescription('');
      setCategory('BOOKING');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to submit report'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" variant="outline" className="gap-1.5"><Flag size={14} /> Report an issue</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>An admin will review this and follow up if needed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ComplaintCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="complaint-description">Describe what happened</Label>
            <Textarea
              id="complaint-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what went wrong..."
              maxLength={1000}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !description.trim()}>
            {mutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
