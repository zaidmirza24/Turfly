import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { TimeSlot } from '@/types';
import { formatSlotTime } from '@/lib/dateKey';
import { formatDuration } from '@/lib/duration';

type Props = {
  /** Every slot on this day a booking could still start on. */
  startCandidates: TimeSlot[];
  selectedStartId: string | null;
  selectedDurationMinutes: number | null;
  /** Longest contiguous run available from a given start, in minutes (0 if that start can't be picked). */
  maxDurationFrom: (startSlotId: string) => number;
  onStartChange: (startSlotId: string) => void;
  onDurationChange: (minutes: number) => void;
};

const MIN_DURATION_MINUTES = 30;

export function CustomTimeSelector({
  startCandidates,
  selectedStartId,
  selectedDurationMinutes,
  maxDurationFrom,
  onStartChange,
  onDurationChange,
}: Props) {
  const maxDuration = selectedStartId ? maxDurationFrom(selectedStartId) : 0;
  const durationOptions: number[] = [];
  for (let m = MIN_DURATION_MINUTES; m <= maxDuration; m += MIN_DURATION_MINUTES) durationOptions.push(m);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Time</Label>
        <Select value={selectedStartId ?? undefined} onValueChange={onStartChange}>
          <SelectTrigger className="h-12 rounded-xl font-bold">
            <SelectValue placeholder="Choose start" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {startCandidates.map((s) => (
              <SelectItem key={s._id} value={s._id}>{formatSlotTime(s.startTime)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duration</Label>
        <Select
          value={selectedDurationMinutes ? String(selectedDurationMinutes) : undefined}
          onValueChange={(v) => onDurationChange(Number(v))}
          disabled={!selectedStartId || durationOptions.length === 0}
        >
          <SelectTrigger className="h-12 rounded-xl font-bold">
            <SelectValue placeholder={selectedStartId ? 'Choose duration' : 'Pick a start first'} />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {durationOptions.map((m) => (
              <SelectItem key={m} value={String(m)}>{formatDuration(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
