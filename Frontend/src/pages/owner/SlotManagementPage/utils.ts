// Every row in the owner's grid is a half-hour slot, so "hour" here is really
// a time-of-day mark that can land on a half-hour (11, 11.5, 12, ...) — kept
// as a single float rather than a separate {hour, minute} pair so the rest of
// this module (ranges, selection, sorting) can keep doing plain arithmetic.
const wholeHour = (hour: number) => Math.floor(hour);
const minutesPart = (hour: number) => Math.round((hour % 1) * 60);

export const sameLocalHour = (isoTime: string, date: Date, hour: number) => {
  const t = new Date(isoTime);
  return (
    t.getFullYear() === date.getFullYear() &&
    t.getMonth() === date.getMonth() &&
    t.getDate() === date.getDate() &&
    t.getHours() === wholeHour(hour) &&
    t.getMinutes() === minutesPart(hour)
  );
};

export const hourStart = (date: Date, hour: number) => {
  const d = new Date(date);
  d.setHours(wholeHour(hour), minutesPart(hour), 0, 0);
  return d;
};

/** "11:30" style label for a half-hour mark. */
export const formatHourMark = (hour: number) =>
  `${String(wholeHour(hour)).padStart(2, '0')}:${String(minutesPart(hour)).padStart(2, '0')}`;

/** The half-hour mark that comes right after `hour` (11 -> 11.5, 11.5 -> 12). */
export const nextHourMark = (hour: number) => Math.round((hour + 0.5) * 2) / 2;

/** True once a half-hour mark is too close (or already past) to ever be bookable. */
export const isPastBookableWindow = (date: Date, hour: number, now: number = Date.now()) =>
  hourStart(date, hour).getTime() <= now;

/**
 * Owners always type a per-*hour* rate; a slot is 30 minutes. Mirrors the
 * server's `hourlyRateToSlotPricePaise` (slot.service.js) so an optimistic
 * price shown here matches what the server will actually store, instead of
 * flashing double and silently correcting itself on refetch.
 */
export const hourlyRateToSlotPrice = (hourlyPrice: number) => Number(hourlyPrice) / 2;

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
    const hourlyPrice = isWeekend ? config.weekendPrice : config.weekdayPrice;

    // Two half-hour slots per operating hour, mirroring the server's own
    // default provisioning (slot.service.js's provisionDefaultSlots) — each
    // priced at half the hourly rate.
    for (let h = config.startHour; h <= config.endHour; h++) {
      for (const mark of [h, h + 0.5]) {
        const startTime = hourStart(currentDate, mark);
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

        newSlots.push({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          price: hourlyRateToSlotPrice(hourlyPrice),
        });
      }
    }
  }

  return newSlots;
}
