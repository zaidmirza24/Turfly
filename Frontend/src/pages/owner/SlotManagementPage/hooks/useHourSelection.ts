import { useEffect, useState } from 'react';
import { TimeSlot } from '@/types';
import { isPastBookableWindow } from '../utils';

type Params = {
  activeDay: Date;
  getSlotForHour: (date: Date, hour: number) => TimeSlot | undefined;
  isMutating: boolean;
  resetKey: string;
};

export function useHourSelection({ activeDay, getSlotForHour, isMutating, resetKey }: Params) {
  const [selectedHours, setSelectedHours] = useState<number[]>([]);

  const clearSelection = () => setSelectedHours([]);

  useEffect(() => {
    clearSelection();
  }, [resetKey]);

  const isHourLocked = (date: Date, hour: number) => {
    const slot = getSlotForHour(date, hour);
    return slot?.status === 'BOOKED' || slot?.status === 'LOCKED';
  };

  // A past (or too-soon-to-book) hour can't be re-marked AVAILABLE/CLOSED/
  // FULL in any way that matters — nothing about it is ever bookable again —
  // so it can't be picked up into the selection either.
  const isHourUnselectable = (date: Date, hour: number) =>
    isHourLocked(date, hour) || isPastBookableWindow(date, hour);

  const handleRowClick = (hour: number) => {
    if (isMutating || isHourUnselectable(activeDay, hour)) return;
    setSelectedHours(prev =>
      prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour]
    );
  };

  return {
    selectedHours,
    clearSelection,
    isHourLocked,
    handleRowClick,
  };
}
