import { useMemo, useState } from 'react';
import { toDateKey } from '@/lib/dateKey';

export function useWeekView() {
  const [viewDate, setViewDate] = useState(new Date());
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(viewDate);
      d.setDate(viewDate.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const activeDay = days[activeDayIndex] || days[0];

  const handleNextWeek = () => {
    const next = new Date(viewDate);
    next.setDate(viewDate.getDate() + 7);
    setViewDate(next);
    setActiveDayIndex(0);
  };

  const handlePrevWeek = () => {
    const prev = new Date(viewDate);
    prev.setDate(viewDate.getDate() - 7);
    setViewDate(prev);
    setActiveDayIndex(0);
  };

  const goToToday = () => {
    setViewDate(new Date());
    setActiveDayIndex(0);
  };

  const jumpToDate = (date: Date) => {
    setViewDate(date);
    setActiveDayIndex(0);
  };

  const startDateStr = toDateKey(viewDate);
  const endDate = new Date(viewDate);
  endDate.setDate(viewDate.getDate() + 7);
  const endDateStr = toDateKey(endDate);

  return {
    viewDate,
    days,
    activeDay,
    activeDayIndex,
    setActiveDayIndex,
    handleNextWeek,
    handlePrevWeek,
    goToToday,
    jumpToDate,
    startDateStr,
    endDateStr,
  };
}
