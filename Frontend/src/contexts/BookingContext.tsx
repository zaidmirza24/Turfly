import React, { createContext, useContext, useState, useCallback } from 'react';
import { TimeSlot, Booking } from '@/types';
import api from '@/lib/api';

interface BookingContextType {
  selectedSlot: TimeSlot | null;
  selectSlot: (slot: TimeSlot | null) => void;
  createBooking: (slotId: string) => Promise<any>;
  cancelBooking: (bookingId: string) => Promise<any>;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const selectSlot = useCallback((slot: TimeSlot | null) => setSelectedSlot(slot), []);

  const createBooking = useCallback(async (slotId: string) => {
    try {
      const res: any = await api.post('/bookings', { slotId });
      setSelectedSlot(null);
      return res.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const cancelBooking = useCallback(async (bookingId: string) => {
    try {
      const res: any = await api.delete(`/bookings/${bookingId}`);
      return res.data;
    } catch (error) {
      throw error;
    }
  }, []);

  return (
    <BookingContext.Provider value={{ selectedSlot, selectSlot, createBooking, cancelBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
}
