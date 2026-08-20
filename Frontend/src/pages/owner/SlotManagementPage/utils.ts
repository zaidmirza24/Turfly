export const sameLocalHour = (isoTime: string, date: Date, hour: number) => {
  const t = new Date(isoTime);
  return t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate() && t.getHours() === hour;
};

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
