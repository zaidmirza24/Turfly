import { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeSlot } from '@/types';
import { useSlotAvailability, DURATION_OPTIONS_MINUTES } from '@/hooks/useSlotAvailability';
import { DurationSelector } from './DurationSelector';
import { StartTimeSelector } from './StartTimeSelector';
import { CustomTimeSelector } from './CustomTimeSelector';
import { BookingTimeline } from './BookingTimeline';
import { BookingSummary } from './BookingSummary';

type Props = {
  turfId: string;
  dateStr: string;
  /** Fires with the resolved contiguous slots once a start time is picked, or null while the selection is incomplete. */
  onSelectionChange: (slots: TimeSlot[] | null) => void;
};

const CONTEXT_PADDING_MS = 2 * 60 * 60 * 1000;

/**
 * "How long do you want to play?" → "When do you want to start?" — the
 * customer never picks individual 30-minute slots directly. Duration first
 * narrows to a fixed set of easy choices; Start Time then only offers times
 * where every half-hour slot the booking would occupy is actually available,
 * so an overlap with a booked/closed period simply never appears as an
 * option instead of being something the customer discovers after picking it.
 */
export function BookingSlotPicker({ turfId, dateStr, onSelectionChange }: Props) {
  const { isLoading, isError, refetch, getStartOptions, getSlotsForRange, getMaxDurationFrom, slotsForDay } =
    useSlotAvailability(turfId, dateStr);

  const [duration, setDuration] = useState<number | 'custom' | null>(null);
  const [selectedStartId, setSelectedStartId] = useState<string | null>(null);
  const [customStartId, setCustomStartId] = useState<string | null>(null);
  const [customDuration, setCustomDuration] = useState<number | null>(null);

  // A new date means every prior choice describes a slot that may no longer
  // exist in this day's data — reset rather than carry stale ids forward.
  useEffect(() => {
    setDuration(null);
    setSelectedStartId(null);
    setCustomStartId(null);
    setCustomDuration(null);
  }, [dateStr]);

  const fixedStartOptions = useMemo(
    () => (typeof duration === 'number' ? getStartOptions(duration) : []),
    [duration, getStartOptions]
  );

  const startCandidates = useMemo(
    () => slotsForDay.filter((s) => s.status === 'AVAILABLE' && new Date(s.startTime).getTime() > Date.now()),
    [slotsForDay]
  );

  const finalSlots: TimeSlot[] | null = useMemo(() => {
    if (duration === 'custom') {
      if (!customStartId || !customDuration) return null;
      return getSlotsForRange(customStartId, customDuration);
    }
    if (typeof duration === 'number' && selectedStartId) {
      return getSlotsForRange(selectedStartId, duration);
    }
    return null;
  }, [duration, customStartId, customDuration, selectedStartId, getSlotsForRange]);

  useEffect(() => {
    onSelectionChange(finalSlots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalSlots]);

  const handleDurationSelect = (value: number | 'custom') => {
    setDuration(value);
    setSelectedStartId(null);
    setCustomStartId(null);
    setCustomDuration(null);
  };

  if (isLoading) {
    return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-primary" size={28} /></div>;
  }

  if (isError) {
    return (
      <div className="text-center py-10 rounded-2xl border-2 border-dashed border-destructive/20 bg-destructive/5">
        <AlertTriangle size={28} className="mx-auto mb-2 text-destructive/60" />
        <p className="text-sm font-bold text-muted-foreground mb-3">Couldn't load availability.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DurationSelector
        options={DURATION_OPTIONS_MINUTES}
        selected={duration}
        isAvailable={(minutes) => getStartOptions(minutes).length > 0}
        onSelect={handleDurationSelect}
      />

      {typeof duration === 'number' && (
        <StartTimeSelector
          options={fixedStartOptions}
          selectedStartId={selectedStartId}
          onSelect={(option) => setSelectedStartId(option.startSlot._id)}
        />
      )}

      {duration === 'custom' && (
        <CustomTimeSelector
          startCandidates={startCandidates}
          selectedStartId={customStartId}
          selectedDurationMinutes={customDuration}
          maxDurationFrom={getMaxDurationFrom}
          onStartChange={(id) => { setCustomStartId(id); setCustomDuration(null); }}
          onDurationChange={setCustomDuration}
        />
      )}

      {finalSlots && finalSlots.length > 0 && (
        <>
          <BookingTimeline
            windowStart={new Date(new Date(finalSlots[0].startTime).getTime() - CONTEXT_PADDING_MS)}
            windowEnd={new Date(new Date(finalSlots[finalSlots.length - 1].endTime).getTime() + CONTEXT_PADDING_MS)}
            selectedStart={new Date(finalSlots[0].startTime)}
            selectedEnd={new Date(finalSlots[finalSlots.length - 1].endTime)}
          />
          <BookingSummary slots={finalSlots} />
        </>
      )}
    </div>
  );
}
