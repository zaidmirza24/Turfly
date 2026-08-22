import { Turf } from '@/types';

/**
 * The lowest hourly rate a turf can be booked at. Turfs with weekend pricing
 * bill a different rate on Sat/Sun, so a flat `pricePerHour` figure (the
 * weekday rate) doesn't match what the slot grid actually charges on a
 * weekend — showing this instead keeps "starting from" honest in both places.
 */
export function startingPricePerHour(turf: Pick<Turf, 'pricePerHour' | 'defaultWeekdayPrice' | 'defaultWeekendPrice'>): number {
  const weekday = turf.defaultWeekdayPrice ?? turf.pricePerHour ?? 500;
  const weekend = turf.defaultWeekendPrice ?? weekday;
  return Math.min(weekday, weekend);
}
