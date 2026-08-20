/**
 * "YYYY-MM-DD" for a Date's local calendar day.
 *
 * Deliberately NOT `date.toISOString().split('T')[0]` — toISOString()
 * converts to UTC first, which silently rolls the date backward or forward
 * near midnight depending on the browser's timezone offset (e.g. 12:30am
 * IST is still the previous UTC day). Every date sent to the backend as a
 * "which day" key should go through this instead, so the day the user is
 * looking at is the day that actually gets requested.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a "YYYY-MM-DD" string (e.g. from an <input type="date">) into a
 * Date at local midnight.
 *
 * Deliberately NOT `new Date(str)` — a date-only ISO string parses as UTC
 * midnight, which is the wrong local calendar day in any timezone ahead of
 * or behind UTC (e.g. in IST it lands on the same day, but the mismatch is
 * still there and breaks the moment this runs somewhere else).
 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Day of week (0=Sun..6=Sat) for a stored slot instant, evaluated in IST —
 * not the viewer's browser timezone. A slot's weekday/weekend pricing is
 * decided server-side in IST (Backend/src/common/utils/istTime.js); display
 * logic that infers "is this a weekend slot" from `new Date(iso).getDay()`
 * would use the browser's local day instead and could disagree with the
 * price actually charged near midnight IST.
 */
export function getISTDay(iso: string): number {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return ist.getUTCDay();
}
