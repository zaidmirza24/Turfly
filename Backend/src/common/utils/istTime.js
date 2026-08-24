// The platform operates in India (₹ pricing, turf hours are India-local)
// but the server process's own timezone varies by environment — UTC in
// production (Vercel), whatever the OS happens to be set to in local dev.
// Relying on Date's local-timezone methods (setHours/setDate/getDay) for
// "what calendar day/hour is this" silently computes a different answer in
// each environment. Every day-boundary and weekday calculation in the slot
// module goes through this file instead, so the answer is always IST
// regardless of where the code runs.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The UTC instant corresponding to `hour:minute IST` on the given
 * "YYYY-MM-DD" calendar date.
 */
export const istDateTime = (dateStr, hour = 0, minute = 0) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0) - IST_OFFSET_MS);
};

/**
 * [start, end] instants covering the full IST calendar day for "YYYY-MM-DD"
 * (end is 23:59:59.999 IST that day).
 */
export const istDayBounds = (dateStr) => {
  const start = istDateTime(dateStr, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

/** The IST hour-of-day (0-23) that a given instant falls in. */
export const istHour = (date) => {
  const istMs = date.getTime() + IST_OFFSET_MS;
  return Math.floor(istMs / (60 * 60 * 1000)) % 24;
};

/**
 * A Mongo range (`{ $gte, $lte }`) covering `from`..`to` inclusive, for a
 * caller that accepts either "YYYY-MM-DD" IST calendar days or full ISO
 * instants. Returns null when neither bound is given.
 *
 * The date-key branch is the point of this: `new Date("2026-08-24")` parses as
 * UTC midnight, which on an IST platform starts the day 5½ hours late and ends
 * it 5½ hours early — so a filter for "today" silently excluded everything
 * before 05:30 IST and swept in the next day's small hours. istDayBounds gets
 * the actual IST day.
 */
export const istRangeFilter = (from, to) => {
  const isDateKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const range = {};
  if (from) range.$gte = isDateKey(from) ? istDayBounds(from).start : new Date(from);
  if (to) range.$lte = isDateKey(to) ? istDayBounds(to).end : new Date(to);
  return Object.keys(range).length ? range : null;
};

const asDateKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

/** "YYYY-MM-DD" for the next IST calendar day after `dateStr`. */
export const nextDateKey = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return asDateKey(new Date(Date.UTC(y, m - 1, d + 1)));
};

/** "YYYY-MM-DD" for the IST calendar day before `dateStr`. */
export const previousDateKey = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return asDateKey(new Date(Date.UTC(y, m - 1, d - 1)));
};

/**
 * The IST calendar day ("YYYY-MM-DD") that an instant falls on. Shifting into
 * IST and then reading the UTC fields is what keeps this independent of the
 * server process's own timezone — `toISOString().slice(0, 10)` would give the
 * UTC day instead, which is a different day for the first 5½ hours of every
 * IST one.
 */
export const istDateKey = (date) => asDateKey(new Date(date.getTime() + IST_OFFSET_MS));

/** The IANA zone the platform's calendar days are defined in, for Mongo's
 * date-aggregation operators (`$dateToString`, `$dayOfWeek`), which take a
 * timezone name rather than an offset. */
export const IST_TIMEZONE = "Asia/Kolkata";
