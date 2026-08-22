import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { TimeSlot, Booking } from '@/types';
import { apiPost, apiDelete } from '@/lib/api';

interface BookingContextType {
  /** Slots currently selected, always all belonging to `selectedTurfId`. */
  selectedSlots: TimeSlot[];
  /** The turf the current selection belongs to, or null when nothing is selected. */
  selectedTurfId: string | null;
  toggleSlot: (slot: TimeSlot) => void;
  /** Drops the selection unless it already belongs to `turfId`. */
  keepSelectionFor: (turfId: string) => void;
  clearSelection: () => void;
  createBooking: (slotIds: string[]) => Promise<Booking | Booking[]>;
  cancelBooking: (bookingId: string) => Promise<Booking>;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);

  const selectedTurfId = selectedSlots[0]?.turfId ?? null;

  const toggleSlot = useCallback((slot: TimeSlot) => {
    setSelectedSlots(prev => {
      const exists = prev.some(s => s._id === slot._id);
      if (exists) {
        const sorted = [...prev].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        // Removing an interior slot would split the remaining selection into
        // two disconnected blocks — the API books one contiguous stretch of
        // time, not several, so that state can never be sent as-is. Removing
        // from either end keeps what's left contiguous; anything else just
        // restarts the selection with only the clicked slot.
        const isEdge = sorted[0]?._id === slot._id || sorted[sorted.length - 1]?._id === slot._id;
        return isEdge ? prev.filter(s => s._id !== slot._id) : [];
      }

      // Selecting a slot from a different venue replaces the selection rather
      // than adding to it. A checkout is per-turf: the confirmation screen
      // shows one turf's name and price, and the API rejects a mixed-turf
      // booking outright.
      const sameTurf = prev.filter(s => s.turfId === slot.turfId);
      if (sameTurf.length === 0) return [slot];

      // A booking is one uninterrupted block of time — the API rejects a
      // selection with a gap between slots — so only accept a new slot that
      // extends the current block at either end. Anything else (a slot with
      // a gap from the current selection) starts a fresh selection instead of
      // silently producing a combination the checkout would just reject.
      const sorted = [...sameTurf].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const extendsEnd = new Date(slot.startTime).getTime() === new Date(last.endTime).getTime();
      const extendsStart = new Date(slot.endTime).getTime() === new Date(first.startTime).getTime();
      if (extendsEnd || extendsStart) {
        return extendsStart ? [slot, ...sorted] : [...sorted, slot];
      }
      return [slot];
    });
  }, []);

  const keepSelectionFor = useCallback((turfId: string) => {
    setSelectedSlots(prev => (prev.length && prev[0].turfId !== turfId ? [] : prev));
  }, []);

  const clearSelection = useCallback(() => setSelectedSlots([]), []);

  // Single slot still goes through the plain /bookings endpoint (unchanged
  // response shape — a single Booking object); more than one goes through
  // /bookings/multi (all-or-nothing, returns an array of Bookings sharing a
  // groupId). Callers should normalize the result to an array either way.
  const createBooking = useCallback(async (slotIds: string[]) => {
    const res = slotIds.length === 1
      ? await apiPost<Booking>('/bookings', { slotId: slotIds[0] })
      : await apiPost<Booking[]>('/bookings/multi', { slotIds });
    setSelectedSlots([]);
    return res.data;
  }, []);

  const cancelBooking = useCallback(async (bookingId: string) => {
    const res = await apiDelete<Booking>(`/bookings/${bookingId}`);
    return res.data;
  }, []);

  // BookingProvider also wraps the entire app above the router — see the
  // matching note in AuthContext.tsx for why this needs to be memoized.
  const value = useMemo(
    () => ({ selectedSlots, selectedTurfId, toggleSlot, keepSelectionFor, clearSelection, createBooking, cancelBooking }),
    [selectedSlots, selectedTurfId, toggleSlot, keepSelectionFor, clearSelection, createBooking, cancelBooking]
  );

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
}
