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

const IST_TZ = 'Asia/Kolkata';

/**
 * Formatters pinned to the turf's own timezone (India).
 *
 * A booking's time is a property of the venue, not of the device looking at
 * it: a customer checking their bookings from another timezone must still see
 * the hour they'll actually turn up to play, and an owner's dashboard must
 * agree with the slot grid. Passing no timeZone (the browser default) makes
 * those disagree by whole hours — and, near midnight, by a whole day.
 */
export function formatSlotDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Date(iso).toLocaleDateString('en-IN', { ...opts, timeZone: IST_TZ });
}

export function formatSlotTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TZ,
  });
}

/** "2:00 PM" for a 1hr slot, "2:00 PM - 5:00 PM" for a merged multi-hour reservation. */
export function formatSlotTimeRange(start: string | Date, end?: string | Date | null): string {
  if (!end || new Date(end).getTime() === new Date(start).getTime()) {
    return formatSlotTime(start);
  }
  return `${formatSlotTime(start)} - ${formatSlotTime(end)}`;
}

/** "YYYY-MM-DD" IST calendar day for an instant — the key the API buckets by. */
export function toISTDateKey(iso: string | Date): string {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}
