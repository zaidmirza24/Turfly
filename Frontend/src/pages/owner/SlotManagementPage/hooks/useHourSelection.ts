import { useEffect, useRef, useState } from 'react';
import { TimeSlot } from '@/types';

type Params = {
  activeDay: Date;
  getSlotForHour: (date: Date, hour: number) => TimeSlot | undefined;
  isMutating: boolean;
  resetKey: string;
};

export function useHourSelection({ activeDay, getSlotForHour, isMutating, resetKey }: Params) {
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const isDragging = useRef(false);
  const dragAnchor = useRef<number | null>(null);

  const clearSelection = () => setSelectedHours([]);

  useEffect(() => {
    clearSelection();
  }, [resetKey]);

  const isHourLocked = (date: Date, hour: number) => {
    const slot = getSlotForHour(date, hour);
    return slot?.status === 'BOOKED' || slot?.status === 'LOCKED';
  };

  const handleRowMouseDown = (hour: number) => {
    if (isMutating || isHourLocked(activeDay, hour)) return;
    isDragging.current = true;
    dragAnchor.current = hour;
    setSelectedHours([hour]);
  };

  const handleRowMouseEnter = (hour: number) => {
    if (!isDragging.current || dragAnchor.current === null) return;
    if (isHourLocked(activeDay, hour)) return;
    const start = Math.min(dragAnchor.current, hour);
    const end = Math.max(dragAnchor.current, hour);
    const range = [];
    for (let h = start; h <= end; h++) {
      if (!isHourLocked(activeDay, h)) range.push(h);
    }
    setSelectedHours(range);
  };

  useEffect(() => {
    const stopDrag = () => { isDragging.current = false; };
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
    };
  }, []);

  const handleTimelineTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const hourAttr = el?.closest('[data-hour]')?.getAttribute('data-hour');
    if (hourAttr !== null && hourAttr !== undefined) {
      handleRowMouseEnter(Number(hourAttr));
    }
  };

  return {
    selectedHours,
    clearSelection,
    isHourLocked,
    handleRowMouseDown,
    handleRowMouseEnter,
    handleTimelineTouchMove,
  };
}
