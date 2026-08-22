export const sameLocalHour = (isoTime: string, date: Date, hour: number) => {
  const t = new Date(isoTime);
  return t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate() && t.getHours() === hour;
};

// Mirrors booking.service.js's MIN_ADVANCE_NOTICE_MS (also duplicated in
// SlotSelector.tsx for the customer-facing grid): a slot inside this window —
// including one that's already started — can never actually be locked or
// booked. Without treating it as such here too, the owner's grid kept
// showing a plain "Available" badge on hours no customer could ever book,
// which read as available inventory that quietly wasn't.
export const MIN_ADVANCE_NOTICE_MS = 30 * 60 * 1000;

export const hourStart = (date: Date, hour: number) => {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** True once an hour is too close (or already past) to ever be bookable. */
export const isPastBookableWindow = (date: Date, hour: number, now: number = Date.now()) =>
  hourStart(date, hour).getTime() <= now + MIN_ADVANCE_NOTICE_MS;

export type BulkConfig = {
  startDate: string;
  days: number;
  startHour: number;
  endHour: number;
  weekdayPrice: number;
  weekendPrice: number;
};

export function buildBulkSlots(config: BulkConfig) {
  const newSlots = [];
  const start = new Date(config.startDate);

  for (let i = 0; i < config.days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);

    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    const price = isWeekend ? config.weekendPrice : config.weekdayPrice;

    for (let h = config.startHour; h <= config.endHour; h++) {
      const startTime = new Date(currentDate);
      startTime.setHours(h, 0, 0, 0);

      const endTime = new Date(startTime);
      endTime.setHours(h + 1, 0, 0, 0);

      newSlots.push({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        price: Number(price),
      });
    }
  }

  return newSlots;
}
