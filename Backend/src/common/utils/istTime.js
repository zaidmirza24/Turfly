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
 * The UTC instant corresponding to `hour:00 IST` on the given "YYYY-MM-DD"
 * calendar date.
 */
export const istDateTime = (dateStr, hour = 0) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0, 0) - IST_OFFSET_MS);
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

/** "YYYY-MM-DD" for the next IST calendar day after `dateStr`. */
export const nextDateKey = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
};
