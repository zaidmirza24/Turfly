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

/**
 * Start instant of a booking/reservation. Prefers the merged `startTime` the
 * grouped list endpoints return (correct even for a multi-hour reservation);
 * falls back to the single populated slot's startTime for endpoints that
 * still return one raw per-hour Booking document (e.g. create/cancel).
 */
export function bookingStartTime(b: Booking): Date | null {
  if (b.startTime) return new Date(b.startTime);
  const slot = bookingSlot(b);
  return slot?.startTime ? new Date(slot.startTime) : null;
}

/** End instant of a booking/reservation — see bookingStartTime. */
export function bookingEndTime(b: Booking): Date | null {
  if (b.endTime) return new Date(b.endTime);
  const slot = bookingSlot(b);
  return slot?.endTime ? new Date(slot.endTime) : null;
}
