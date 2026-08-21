import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BookingProvider, useBooking } from './BookingContext';
import { TimeSlot } from '@/types';

const slot = (id: string, turfId: string): TimeSlot => ({
  _id: id,
  turfId,
  startTime: '2026-08-22T05:30:00.000Z',
  endTime: '2026-08-22T06:30:00.000Z',
  status: 'AVAILABLE',
  price: 1000,
});

const setup = () =>
  renderHook(() => useBooking(), {
    wrapper: ({ children }) => <BookingProvider>{children}</BookingProvider>,
  });

describe('slot selection', () => {
  it('accumulates slots from the same turf', () => {
    const { result } = setup();
    act(() => result.current.toggleSlot(slot('s1', 'turf-a')));
    act(() => result.current.toggleSlot(slot('s2', 'turf-a')));

    expect(result.current.selectedSlots.map(s => s._id)).toEqual(['s1', 's2']);
    expect(result.current.selectedTurfId).toBe('turf-a');
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
