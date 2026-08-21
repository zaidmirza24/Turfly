import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Settings, Zap } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Turf } from '@/types';
import { ApplyDefaultsMutation, UpdateTurfMutation } from '../types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTurf: Turf | undefined;
  updateTurfMutation: UpdateTurfMutation;
  applyDefaultsMutation: ApplyDefaultsMutation;
};

export function TurfSettingsDialog({ open, onOpenChange, currentTurf, updateTurfMutation, applyDefaultsMutation }: Props) {
  const [is24x7, setIs24x7] = useState(true);
  const [openHour, setOpenHour] = useState(6);
  const [closeHour, setCloseHour] = useState(22);

  useEffect(() => {
    if (currentTurf) {
      setIs24x7(currentTurf.is24x7 ?? true);
      setOpenHour(currentTurf.openHour ?? 6);
      setCloseHour(currentTurf.closeHour ?? 22);
    }
  }, [currentTurf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full gap-2 h-12 px-6 border-primary/20 hover:bg-primary/5 transition-all card-hover glass">
          <Settings size={18} className="text-primary" />
          <span className="font-bold tracking-tight">Turf Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[2.5rem] sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-primary/20 via-background to-background p-8">
          <DialogHeader className="mb-8">
            <DialogTitle className="text-3xl font-black tracking-tighter">Turf Settings</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
              Set your operating hours and standard rates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-muted">
              <div>
                <div className="text-sm font-bold">Open 24 Hours</div>
                <div className="text-[10px] text-muted-foreground font-medium">This turf never closes</div>
              </div>
              <Switch checked={is24x7} onCheckedChange={setIs24x7} />
            </div>

            {!is24x7 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Opens At</Label>
                  <Input
                    type="number" min={0} max={23}
                    value={openHour}
                    onChange={(e) => setOpenHour(Number(e.target.value))}
                    className="h-14 rounded-2xl bg-muted border-none font-bold"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Closes At</Label>
                  <Input
                    type="number" min={0} max={23}
                    value={closeHour}
                    onChange={(e) => setCloseHour(Number(e.target.value))}
                    className="h-14 rounded-2xl bg-muted border-none font-bold"
                  />
                </div>
              </div>
            )}

            <div className="h-[1px] bg-border" />

            <div className="group space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Weekday Standard</Label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                <Input
                  type="number"
                  defaultValue={currentTurf?.defaultWeekdayPrice || 1000}
                  id="defWeekday"
                  className="h-14 pl-10 rounded-2xl bg-muted border-2 border-transparent focus-visible:ring-primary focus-visible:border-primary transition-all text-lg font-bold"
                />
              </div>
            </div>

            <div className="group space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Weekend Premium</Label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                <Input
                  type="number"
                  defaultValue={currentTurf?.defaultWeekendPrice || 1500}
                  id="defWeekend"
                  className="h-14 pl-10 rounded-2xl bg-primary/5 border-2 border-primary/20 focus-visible:ring-primary transition-all text-lg font-bold"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  if (confirm('Apply these prices to all existing unbooked slots?')) {
                    applyDefaultsMutation.mutate();
                  }
                }}
                disabled={applyDefaultsMutation.isPending}
                className="w-full p-4 rounded-2xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                    {applyDefaultsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Sync Schedule</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Apply rates to all available slots</div>
                  </div>
                </div>
                <Plus size={16} className="text-primary transition-transform group-hover:rotate-90" />
              </button>
            </div>
          </div>

          <DialogFooter className="mt-10 gap-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-12 flex-1">Cancel</Button>
            <Button
              disabled={updateTurfMutation.isPending}
              onClick={() => {
                const weekday = (document.getElementById('defWeekday') as HTMLInputElement).value;
                const weekend = (document.getElementById('defWeekend') as HTMLInputElement).value;
                if (!is24x7 && Number(openHour) > Number(closeHour)) {
                  toast.error('Opening hour must be before closing hour');
                  return;
                }
                updateTurfMutation.mutate({
                  defaultWeekdayPrice: Number(weekday),
                  defaultWeekendPrice: Number(weekend),
                  is24x7,
                  openHour: is24x7 ? 0 : Number(openHour),
                  closeHour: is24x7 ? 23 : Number(closeHour),
                });
              }}
              className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
            >
              {updateTurfMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
