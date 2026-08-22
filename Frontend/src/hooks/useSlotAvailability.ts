import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { TimeSlot } from '@/types';
import { toDateKey } from '@/lib/dateKey';

// Mirrors booking.service.js's MAX_SLOTS_PER_BOOKING (10 half-hour slots) —
// kept in sync manually since the two run in different codebases. Every
// duration option offered here must stay at or under this, or a selection
// the UI happily builds would be rejected by the server at confirm time.
export const MAX_BOOKING_MINUTES = 300;

export const DURATION_OPTIONS_MINUTES = [30, 60, 90, 120, 150, 180, 210].filter(
  (m) => m <= MAX_BOOKING_MINUTES
);

const SLOT_MINUTES = 30;

const nextDateKey = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return toDateKey(next);
};

export interface StartOption {
  /** The slot a booking of this duration would start on. */
  startSlot: TimeSlot;
  /** Every contiguous half-hour slot the booking would occupy, in order. */
  slots: TimeSlot[];
}

/**
 * Turns the turf's flat list of 30-minute Slot documents into the higher-level
 * question a customer actually asks: "if I want to play for X, when can I
 * start?" — instead of making them reason about individual half-hour blocks.
 *
 * Fetches a two-calendar-day window (`dateStr` and the day after) rather than
 * just `dateStr` alone, because a booking made late in the evening (e.g.
 * 11 PM for 3 hours) runs past midnight into the next day's slot documents.
 * Restricting start options to slots whose own startTime falls on `dateStr`
 * still keeps "what date am I booking" unambiguous — only the tail end of a
 * late booking may spill into the next day.
 */
export function useSlotAvailability(turfId: string | undefined, dateStr: string) {
  const nextDateStr = useMemo(() => nextDateKey(dateStr), [dateStr]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['slots-range', turfId, dateStr, nextDateStr],
    queryFn: () => apiGet<TimeSlot[]>(`/slots?turfId=${turfId}&startDate=${dateStr}&endDate=${nextDateStr}`),
    enabled: !!turfId,
  });

  const sortedSlots = useMemo(() => {
    const list = data?.data ?? [];
    return [...list].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [data]);

  const slotsForDay = useMemo(
    () => sortedSlots.filter((s) => toDateKey(new Date(s.startTime)) === dateStr),
    [sortedSlots, dateStr]
  );

  const isBookable = useCallback(
    (s: TimeSlot) => s.status === 'AVAILABLE' && new Date(s.startTime).getTime() > Date.now(),
    []
  );

  /** The contiguous run of slots a booking of `durationMinutes` starting on `startSlot` would occupy, or null if any part of it is unavailable, missing, or non-contiguous. */
  const getSlotsForRange = useCallback(
    (startSlotId: string, durationMinutes: number): TimeSlot[] | null => {
      const startIdx = sortedSlots.findIndex((s) => s._id === startSlotId);
      if (startIdx === -1) return null;

      const count = durationMinutes / SLOT_MINUTES;
      const result: TimeSlot[] = [];
      for (let k = 0; k < count; k++) {
        const slot = sortedSlots[startIdx + k];
        if (!slot || !isBookable(slot)) return null;
        if (k > 0) {
          const prev = result[k - 1];
          if (new Date(prev.endTime).getTime() !== new Date(slot.startTime).getTime()) return null;
        }
        result.push(slot);
      }
      return result;
    },
    [sortedSlots, isBookable]
  );

  /** Every valid start time for a booking of `durationMinutes`, restricted to starts that fall on `dateStr`. */
  const getStartOptions = useCallback(
    (durationMinutes: number): StartOption[] => {
      return slotsForDay
        .filter(isBookable)
        .map((startSlot) => {
          const slots = getSlotsForRange(startSlot._id, durationMinutes);
          return slots ? { startSlot, slots } : null;
        })
        .filter((o): o is StartOption => o !== null);
    },
    [slotsForDay, isBookable, getSlotsForRange]
  );

  /** How long a booking starting on `startSlotId` could run before hitting an unavailable or missing slot, capped at MAX_BOOKING_MINUTES. */
  const getMaxDurationFrom = useCallback(
    (startSlotId: string): number => {
      const startIdx = sortedSlots.findIndex((s) => s._id === startSlotId);
      if (startIdx === -1) return 0;
      let minutes = 0;
      for (let i = startIdx; minutes < MAX_BOOKING_MINUTES; i++) {
        const slot = sortedSlots[i];
        if (!slot || !isBookable(slot)) break;
        if (i > startIdx) {
          const prev = sortedSlots[i - 1];
          if (new Date(prev.endTime).getTime() !== new Date(slot.startTime).getTime()) break;
        }
        minutes += SLOT_MINUTES;
      }
      return minutes;
    },
    [sortedSlots, isBookable]
  );

  return {
    isLoading,
    isError,
    refetch,
    slotsForDay,
    sortedSlots,
    getStartOptions,
    getSlotsForRange,
    getMaxDurationFrom,
  };
}
