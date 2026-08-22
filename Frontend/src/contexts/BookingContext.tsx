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
      if (exists) return prev.filter(s => s._id !== slot._id);
      // Selecting a slot from a different venue replaces the selection rather
      // than adding to it. A checkout is per-turf: the confirmation screen
      // shows one turf's name and price, and the API rejects a mixed-turf
      // booking outright.
      const sameTurf = prev.filter(s => s.turfId === slot.turfId);
      return [...sameTurf, slot];
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
