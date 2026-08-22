import { useEffect, useRef, useState } from 'react';
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

  // A past (or too-soon-to-book) hour can't be re-marked AVAILABLE/CLOSED/
  // FULL in any way that matters — nothing about it is ever bookable again —
  // so bulk drag-select skips it the same way it already skips BOOKED/LOCKED.
  const isHourUnselectable = (date: Date, hour: number) =>
    isHourLocked(date, hour) || isPastBookableWindow(date, hour);

  const handleRowMouseDown = (hour: number) => {
    if (isMutating || isHourUnselectable(activeDay, hour)) return;
    isDragging.current = true;
    dragAnchor.current = hour;
    setSelectedHours([hour]);
  };

  const handleRowMouseEnter = (hour: number) => {
    if (!isDragging.current || dragAnchor.current === null) return;
    if (isHourUnselectable(activeDay, hour)) return;
    const start = Math.min(dragAnchor.current, hour);
    const end = Math.max(dragAnchor.current, hour);
    const range = [];
    for (let h = start; h <= end; h += 0.5) {
      if (!isHourUnselectable(activeDay, h)) range.push(h);
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
    // Without this, a vertical finger-drag is indistinguishable from the
    // native page-scroll gesture — the browser scrolls the timeline under
    // the finger at the same time this tries to read which row it's over,
    // so elementFromPoint keeps targeting the wrong hour mid-drag. The
    // `touch-action: none` on the timeline container (DayTimeline.tsx) stops
    // the browser from starting that scroll in the first place; this
    // preventDefault is the belt-and-braces backup for browsers that still
    // fire the gesture before honoring touch-action.
    e.preventDefault();
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
