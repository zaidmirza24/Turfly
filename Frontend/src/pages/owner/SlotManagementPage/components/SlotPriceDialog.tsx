import { toast } from 'sonner';
import { CreateSlotsMutation } from '../types';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hourStart, formatHourMark } from '../utils';

export type EditingSlot = { date: Date; hour: number; price: number };

type Props = {
  editingSlot: EditingSlot | null;
  onClose: () => void;
  selectedTurfId: string;
  createSlotsMutation: CreateSlotsMutation;
};

export function SlotPriceDialog({ editingSlot, onClose, selectedTurfId, createSlotsMutation }: Props) {
  if (!editingSlot) return null;

  const saveSlotPrice = (price: number) => {
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    const { date, hour } = editingSlot;
    const startTime = hourStart(date, hour);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    createSlotsMutation.mutate({
      turfId: selectedTurfId,
      slots: [{
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        price: Number(price),
      }],
    });
  };

  return (
    <Dialog open={!!editingSlot} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl sm:max-w-[400px]">
        <div className="bg-gradient-to-br from-primary/20 via-background to-background p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-black tracking-tighter">Set Slot Price</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">
              {editingSlot.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} @ {formatHourMark(editingSlot.hour)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="group space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Price for this 30-min slot</Label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-xl">₹</div>
                <Input
                  type="number"
                  autoFocus
                  min={0}
                  defaultValue={editingSlot.price}
                  id="slotPriceInput"
                  className="h-16 pl-10 rounded-2xl bg-muted border-2 border-transparent focus-visible:border-primary/30 focus-visible:ring-0 transition-all text-2xl font-black"
                  onKeyDown={(e) => e.key === 'Enter' && saveSlotPrice(Number((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-8 gap-3">
            <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold h-12 flex-1">Cancel</Button>
            <Button
              disabled={createSlotsMutation.isPending}
              onClick={() => {
                const price = (document.getElementById('slotPriceInput') as HTMLInputElement).value;
                saveSlotPrice(Number(price));
              }}
              className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
            >
              {createSlotsMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Confirm Slot'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
