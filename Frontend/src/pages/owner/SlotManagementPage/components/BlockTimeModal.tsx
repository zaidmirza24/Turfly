import { useState } from 'react';
import { Ban, Loader2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toDateKey, parseDateKey } from '@/lib/dateKey';
import { formatHourMark } from '../utils';
import { SlotAction, SlotsApiResponse } from '../types';
import { UseMutationResult } from '@tanstack/react-query';
import { ApiEnvelope } from '@/lib/api';
import { TimeSlot } from '@/types';

const START_MARKS = Array.from({ length: 48 }, (_, i) => i * 0.5); // 0, 0.5, 1, ... 23.5
const DURATION_HOURS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6];

type SetStatusMutation = UseMutationResult<
  ApiEnvelope<TimeSlot[]>,
  Error,
  { turfId: string; slots: { startTime: string; endTime: string }[]; status: SlotAction },
  { previous?: SlotsApiResponse }
>;

type Props = {
  selectedTurfId: string;
  defaultDate: Date;
  setStatusMutation: SetStatusMutation;
};

/**
 * A range built here can cross midnight into the next calendar day — the
 * backend's bulk status endpoint (PATCH /slots/status) has no same-day
 * restriction and creates any missing slot documents it needs, so "block
 * Court 1 from 11 PM to 2 AM" works as one call without provisioning either
 * day first. This is a closure/maintenance tool, not general overnight
 * booking support — a customer still can't book across midnight today.
 */
export function BlockTimeModal({ selectedTurfId, defaultDate, setStatusMutation }: Props) {
  const [open, setOpen] = useState(false);
  const [dateKey, setDateKey] = useState(() => toDateKey(defaultDate));
  const [startMark, setStartMark] = useState(23);
  const [durationHours, setDurationHours] = useState(1);
  const [status, setStatus] = useState<'CLOSED' | 'FULL'>('CLOSED');

  const buildSlots = () => {
    const date = parseDateKey(dateKey);
    const wholeHour = Math.floor(startMark);
    const minutes = Math.round((startMark % 1) * 60);
    const start = new Date(date);
    start.setHours(wholeHour, minutes, 0, 0);

    const count = Math.round(durationHours * 2); // half-hour increments
    const slots: { startTime: string; endTime: string }[] = [];
    let cursor = new Date(start);
    for (let i = 0; i < count; i++) {
      const end = new Date(cursor.getTime() + 30 * 60 * 1000);
      slots.push({ startTime: cursor.toISOString(), endTime: end.toISOString() });
      cursor = end;
    }
    return slots;
  };

  const endLabel = () => {
    const slots = buildSlots();
    if (slots.length === 0) return '';
    const last = new Date(slots[slots.length - 1].endTime);
    const first = new Date(slots[0].startTime);
    const crossesDay = last.toDateString() !== first.toDateString();
    return `${last.getHours().toString().padStart(2, '0')}:${last.getMinutes().toString().padStart(2, '0')}${crossesDay ? ' (next day)' : ''}`;
  };

  const handleSubmit = () => {
    setStatusMutation.mutate(
      { turfId: selectedTurfId, slots: buildSlots(), status },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full gap-2 h-12 px-6 border-primary/20 hover:bg-primary/5 transition-all card-hover glass">
          <Ban size={18} className="text-primary" />
          <span className="font-bold tracking-tight">Block Time</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Block Time</DialogTitle>
          <DialogDescription>Close a range of time in one go — can run past midnight.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start time</Label>
              <Select value={String(startMark)} onValueChange={(v) => setStartMark(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {START_MARKS.map((m) => <SelectItem key={m} value={String(m)}>{formatHourMark(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={String(durationHours)} onValueChange={(v) => setDurationHours(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}h</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Blocks {formatHourMark(startMark)} → {endLabel()}
          </p>

          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus('CLOSED')}
                className={cn('flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border-2 font-bold text-sm transition-colors',
                  status === 'CLOSED' ? 'bg-muted border-foreground/20' : 'border-input text-muted-foreground')}
              >
                <Ban size={14} /> Maintenance / Closed
              </button>
              <button
                type="button"
                onClick={() => setStatus('FULL')}
                className={cn('flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border-2 font-bold text-sm transition-colors',
                  status === 'FULL' ? 'bg-warning/10 border-warning/40 text-warning' : 'border-input text-muted-foreground')}
              >
                <UserCheck size={14} /> Booked Outside App
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={setStatusMutation.isPending} onClick={handleSubmit}>
            {setStatusMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : 'Block Time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
