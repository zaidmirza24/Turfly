import { describe, it, expect } from 'vitest';
import { toDateKey, parseDateKey, getISTDay, toISTDateKey, formatSlotTime, formatSlotDate } from './dateKey';

describe('toDateKey / parseDateKey', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // Late evening local time: toISOString() would roll this to the next day
    // in any timezone behind UTC, and to the same day only by luck elsewhere.
    const d = new Date(2026, 7, 21, 23, 45);
    expect(toDateKey(d)).toBe('2026-08-21');
  });

  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips through parseDateKey at local midnight', () => {
    const key = '2026-03-09';
    const parsed = parseDateKey(key);
    expect(parsed.getHours()).toBe(0);
    expect(toDateKey(parsed)).toBe(key);
  });
});

describe('IST-anchored helpers', () => {
  // 2026-08-21T19:00:00Z is 00:30 IST on 2026-08-22 — the case where the UTC
  // day and the IST day disagree, which is what the owner revenue chart and
  // the weekday/weekend pricing both got wrong.
  const lateNightIST = '2026-08-21T19:00:00.000Z';

  it('toISTDateKey buckets by the IST calendar day', () => {
    expect(toISTDateKey(lateNightIST)).toBe('2026-08-22');
    expect(lateNightIST.split('T')[0]).toBe('2026-08-21'); // the old, wrong key
  });

  it('getISTDay reports the IST weekday', () => {
    // 2026-08-22 IST is a Saturday (weekend pricing), while the same instant
    // is still Friday in UTC.
    expect(getISTDay(lateNightIST)).toBe(6);
    expect(new Date(lateNightIST).getUTCDay()).toBe(5);
  });

  it('formats times in IST regardless of the viewer timezone', () => {
    // 05:30 UTC = 11:00 IST.
    expect(formatSlotTime('2026-08-21T05:30:00.000Z')).toMatch(/11:00/);
  });

  it('formats the IST calendar date, not the UTC one', () => {
    expect(formatSlotDate(lateNightIST, { day: 'numeric', month: 'short' })).toContain('22');
  });
});
