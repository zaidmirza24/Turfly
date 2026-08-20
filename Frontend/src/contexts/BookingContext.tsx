import React, { createContext, useContext, useState, useCallback } from 'react';
import { TimeSlot } from '@/types';
import api from '@/lib/api';

const getSlotId = (slot: TimeSlot) => slot._id || (slot as any).id;

interface BookingContextType {
  selectedSlots: TimeSlot[];
  toggleSlot: (slot: TimeSlot) => void;
  clearSelection: () => void;
  createBooking: (slotIds: string[]) => Promise<any>;
  cancelBooking: (bookingId: string) => Promise<any>;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);

  const toggleSlot = useCallback((slot: TimeSlot) => {
    const id = getSlotId(slot);
    setSelectedSlots(prev => {
      const exists = prev.some(s => getSlotId(s) === id);
      if (exists) return prev.filter(s => getSlotId(s) !== id);
      return [...prev, slot];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedSlots([]), []);

  // Single slot still goes through the plain /bookings endpoint (unchanged
  // response shape — a single Booking object); more than one goes through
  // /bookings/multi (all-or-nothing, returns an array of Bookings sharing a
  // groupId). Callers should normalize the result to an array either way.
  const createBooking = useCallback(async (slotIds: string[]) => {
    const res: any = slotIds.length === 1
      ? await api.post('/bookings', { slotId: slotIds[0] })
      : await api.post('/bookings/multi', { slotIds });
    setSelectedSlots([]);
    return res.data;
  }, []);

  const cancelBooking = useCallback(async (bookingId: string) => {
    const res: any = await api.delete(`/bookings/${bookingId}`);
    return res.data;
  }, []);

  return (
    <BookingContext.Provider value={{ selectedSlots, toggleSlot, clearSelection, createBooking, cancelBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
}
