import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimeSlot } from '@/types';
import { toDateKey } from '@/lib/dateKey';
import { useSlotAvailability, MAX_BOOKING_MINUTES } from './useSlotAvailability';

vi.mock('@/lib/api', () => ({ apiGet: vi.fn() }));
import { apiGet } from '@/lib/api';

// Built off "tomorrow" rather than a fixed calendar date, so every fixture
// slot is guaranteed to be in the future regardless of when this test
// actually runs (isBookable excludes anything that's already started) — and
// local Date construction throughout so it also doesn't depend on which
// timezone the machine running it happens to be in.
const day1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
day1.setHours(0, 0, 0, 0);
const day2 = new Date(day1.getTime() + 24 * 60 * 60 * 1000);
const dateStr = toDateKey(day1);

const mkSlot = (id: string, hour: number, minute: number, day: Date, status: TimeSlot['status'] = 'AVAILABLE'): TimeSlot => {
  const start = new Date(day);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { _id: id, turfId: 'turf-1', startTime: start.toISOString(), endTime: end.toISOString(), status, price: 350 };
};

// 22:30 is BOOKED — a 1h booking starting at 22:00 would run into it and must
// be excluded. 23:30 -> 00:00 (day2) is a clean run spanning midnight.
const FIXTURE: TimeSlot[] = [
  mkSlot('s2200', 22, 0, day1),
  mkSlot('s2230', 22, 30, day1, 'BOOKED'),
  mkSlot('s2300', 23, 0, day1),
  mkSlot('s2330', 23, 30, day1),
  mkSlot('s0000', 0, 0, day2),
  mkSlot('s0030', 0, 30, day2),
];

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSlotAvailability', () => {
  it('marks a start time whose duration would overlap a booked slot as not bookable, but still lists it', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, message: '', data: FIXTURE });
    const { result } = renderHook(() => useSlotAvailability('turf-1', dateStr), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 22:00 + 1h (22:00-23:00) would run into the 22:30 BOOKED slot — still
    // shown to the customer, just not selectable.
    const oneHourOptions = result.current.getStartOptions(60);
    const s2200 = oneHourOptions.find((o) => o.startSlot._id === 's2200');
    expect(s2200?.bookable).toBe(false);
    // 23:00 + 1h (23:00-00:00) is fully clear.
    const s2300 = oneHourOptions.find((o) => o.startSlot._id === 's2300');
    expect(s2300?.bookable).toBe(true);
  });

  it('resolves a booking that crosses midnight into one contiguous run', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, message: '', data: FIXTURE });
    const { result } = renderHook(() => useSlotAvailability('turf-1', dateStr), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 22:00 for 1h fails — it would need the BOOKED 22:30 slot.
    expect(result.current.getSlotsForRange('s2200', 60)).toBeNull();

    // 23:30 (day1) for 1h spans 23:30 -> 00:30 (day2) — a real midnight
    // crossing — and must resolve to exactly those two half-hour slots.
    const crossing = result.current.getSlotsForRange('s2330', 60);
    expect(crossing?.map((s) => s._id)).toEqual(['s2330', 's0000']);
  });

  it('caps how far a duration can run at MAX_BOOKING_MINUTES', async () => {
    vi.mocked(apiGet).mockResolvedValue({ success: true, message: '', data: FIXTURE });
    const { result } = renderHook(() => useSlotAvailability('turf-1', dateStr), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.getMaxDurationFrom('s2200')).toBeLessThanOrEqual(MAX_BOOKING_MINUTES);
  });
});
