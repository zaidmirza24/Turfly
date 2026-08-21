import { Booking } from '@/types';

/**
 * Accessors for a Booking's related documents.
 *
 * The list endpoints (`/bookings`, `/bookings/owner`) populate turfId, userId
 * and slotId; the create/cancel endpoints return them as raw ids. These narrow
 * the union in one place so pages don't each re-derive it with `as any`.
 */

/** The populated slot on a booking, when the endpoint populated it. */
export function bookingSlot(b: Booking) {
  return typeof b.slotId === 'object' ? b.slotId : undefined;
}

/** The populated turf on a booking, when the endpoint populated it. */
export function bookingTurf(b: Booking) {
  return typeof b.turfId === 'object' ? b.turfId : undefined;
}

/** The populated customer on a booking, when the endpoint populated it. */
export function bookingUser(b: Booking) {
  return typeof b.userId === 'object' ? b.userId : undefined;
}

/** Start instant of a booking's slot, or null when the slot wasn't populated. */
export function bookingStartTime(b: Booking): Date | null {
  const slot = bookingSlot(b);
  return slot?.startTime ? new Date(slot.startTime) : null;
}
