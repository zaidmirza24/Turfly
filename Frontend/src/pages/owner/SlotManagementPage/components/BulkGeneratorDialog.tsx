import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Turf } from '@/types';
import { toDateKey } from '@/lib/dateKey';
import { buildBulkSlots } from '../utils';
import { CreateSlotsMutation } from '../types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTurfId: string;
  currentTurf: Turf | undefined;
  createSlotsMutation: CreateSlotsMutation;
};

export function BulkGeneratorDialog({ open, onOpenChange, selectedTurfId, currentTurf, createSlotsMutation }: Props) {
  const [bulkConfig, setBulkConfig] = useState({
    startDate: toDateKey(new Date()),
    days: 7,
    startHour: 0,
    endHour: 23,
    weekdayPrice: 1000,
    weekendPrice: 1500,
  });

  // Pre-fill from turf defaults / operating hours whenever the selected turf changes.
  useEffect(() => {
    if (currentTurf) {
      setBulkConfig(prev => ({
        ...prev,
        startHour: currentTurf.is24x7 === false ? (currentTurf.openHour ?? prev.startHour) : 0,
        endHour: currentTurf.is24x7 === false ? (currentTurf.closeHour ?? prev.endHour) : 23,
        weekdayPrice: currentTurf.defaultWeekdayPrice || currentTurf.pricePerHour || 1000,
        weekendPrice: currentTurf.defaultWeekendPrice || (currentTurf.pricePerHour ? currentTurf.pricePerHour * 1.5 : 1500),
      }));
    }
  }, [currentTurf]);

  const handleBulkGenerate = () => {
    if (bulkConfig.days < 1 || bulkConfig.startHour > bulkConfig.endHour) {
      toast.error('Check your duration and hour range before generating.');
      return;
    }

    createSlotsMutation.mutate({
      turfId: selectedTurfId,
      slots: buildBulkSlots(bulkConfig),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gradient-primary rounded-full shadow-lg shadow-primary/20 gap-2 h-12 px-8 font-bold card-hover">
          <Sparkles size={18} /> Bulk Generator
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl sm:max-w-[450px]">
        <div className="bg-gradient-to-br from-primary/10 via-background to-background p-8">
          <DialogHeader className="mb-8">
            <DialogTitle className="text-3xl font-black tracking-tighter">Mass Schedule</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
              Generate weeks of inventory in a single click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="startDate" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Start From</Label>
              <Input
                id="startDate"
                type="date"
                value={bulkConfig.startDate}
                onChange={(e) => setBulkConfig({ ...bulkConfig, startDate: e.target.value })}
                className="h-14 rounded-2xl bg-muted border-none font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="days" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Duration (Days)</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  value={bulkConfig.days}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, days: Number(e.target.value) })}
                  className="h-14 rounded-2xl bg-muted border-none font-bold"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="startHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily Start</Label>
                <Input
                  id="startHour"
                  type="number"
                  min={0} max={23}
                  value={bulkConfig.startHour}
                  onChange={(e) => setBulkConfig({ ...bulkConfig, startHour: Number(e.target.value) })}
                  className="h-14 rounded-2xl bg-muted border-none font-bold"
                />
              </div>
            </div>

            <div className="p-5 rounded-3xl glass border-primary/10 space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest">Rate Configuration</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold opacity-50 ml-1">Weekday</Label>
                  <Input
                    type="number"
                    value={bulkConfig.weekdayPrice}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, weekdayPrice: Number(e.target.value) })}
                    className="h-12 rounded-xl bg-muted border-none font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-primary ml-1">Weekend</Label>
                  <Input
                    type="number"
                    value={bulkConfig.weekendPrice}
                    onChange={(e) => setBulkConfig({ ...bulkConfig, weekendPrice: Number(e.target.value) })}
                    className="h-12 rounded-xl bg-muted border-primary/10 border font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="endHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily End</Label>
              <Input
                id="endHour"
                type="number"
                min={0} max={23}
                value={bulkConfig.endHour}
                onChange={(e) => setBulkConfig({ ...bulkConfig, endHour: Number(e.target.value) })}
                className="h-14 rounded-2xl bg-muted border-none font-bold"
              />
            </div>
          </div>

          <DialogFooter className="mt-10 gap-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-12 flex-1">Discard</Button>
            <Button
              onClick={handleBulkGenerate}
              disabled={createSlotsMutation.isPending}
              className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
            >
              {createSlotsMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Build Schedule'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
