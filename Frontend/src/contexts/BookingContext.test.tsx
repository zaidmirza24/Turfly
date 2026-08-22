import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BookingProvider, useBooking } from './BookingContext';
import { TimeSlot } from '@/types';

const slot = (id: string, turfId: string, startTime = '2026-08-22T05:30:00.000Z', endTime = '2026-08-22T06:00:00.000Z'): TimeSlot => ({
  _id: id,
  turfId,
  startTime,
  endTime,
  status: 'AVAILABLE',
  price: 1000,
});

const setup = () =>
  renderHook(() => useBooking(), {
    wrapper: ({ children }) => <BookingProvider>{children}</BookingProvider>,
  });

describe('slot selection', () => {
  it('accumulates back-to-back slots from the same turf', () => {
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a', '2026-08-22T05:30:00.000Z', '2026-08-22T06:00:00.000Z')));
    act(() => result.current.toggleSlot(slot('s2', 'turf-a', '2026-08-22T06:00:00.000Z', '2026-08-22T06:30:00.000Z')));

    expect(result.current.selectedSlots.map(s => s._id)).toEqual(['s1', 's2']);
    expect(result.current.selectedTurfId).toBe('turf-a');
  });

  it('selecting a non-adjacent slot from the same turf restarts the selection', () => {
    // A booking must be one uninterrupted block of time (the API rejects a
    // gap between slots), so a slot that doesn't extend the current block
    // starts a fresh selection instead of producing a combination that would
    // just be rejected at checkout.
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a', '2026-08-22T05:30:00.000Z', '2026-08-22T06:00:00.000Z')));
    act(() => result.current.toggleSlot(slot('s3', 'turf-a', '2026-08-22T07:00:00.000Z', '2026-08-22T07:30:00.000Z')));

    expect(result.current.selectedSlots.map(s => s._id)).toEqual(['s3']);
  });

  it('toggling a selected slot removes it', () => {
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));

    expect(result.current.selectedSlots).toHaveLength(0);
    expect(result.current.selectedTurfId).toBeNull();
  });

  it('selecting a slot from another turf replaces the selection', () => {
    // The regression this guards: selection is global, so picking a slot at
    // turf A and then one at turf B used to leave both selected. Checkout
    // would show turf B's name while charging for — and booking — turf A's
    // slot too.
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));
    act(() => result.current.toggleSlot(slot('s2', 'turf-b')));

    expect(result.current.selectedSlots.map(s => s._id)).toEqual(['s2']);
    expect(result.current.selectedTurfId).toBe('turf-b');
  });

  it('keepSelectionFor drops a selection belonging to a different turf', () => {
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));

    act(() => result.current.keepSelectionFor('turf-b'));
    expect(result.current.selectedSlots).toHaveLength(0);
  });

  it('keepSelectionFor preserves a selection for the same turf', () => {
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));

    act(() => result.current.keepSelectionFor('turf-a'));
    expect(result.current.selectedSlots.map(s => s._id)).toEqual(['s1']);
  });
});
