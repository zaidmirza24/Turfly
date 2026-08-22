/** "1h 30m" style label for a span given in minutes; whole hours drop the minutes part. */
export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Longer form for summary text, e.g. "3 hours", "1.5 hours", "30 minutes". */
export function formatDurationLong(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  const label = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
  return `${label} hour${hours === 1 ? '' : 's'}`;
}
