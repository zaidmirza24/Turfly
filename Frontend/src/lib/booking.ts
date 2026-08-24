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

/** Terminal statuses meaning the slot has passed, whether or not anyone turned up. */
export const FINISHED_STATUSES = ['COMPLETED', 'NO_SHOW'] as const;

/**
 * True when this booking is done — played, a no-show, or simply a CONFIRMED
 * booking whose slot has already passed.
 *
 * That last case is why this isn't a plain status check: the server settles
 * CONFIRMED → COMPLETED lazily, when a booking list is read, so a booking that
 * finished ten minutes ago can still legitimately arrive as CONFIRMED. Time is
 * the source of truth; the status is a materialised view of it.
 */
export function isFinishedBooking(b: Booking, now: number = Date.now()): boolean {
  if (b.status === 'CANCELLED') return false;
  if ((FINISHED_STATUSES as readonly string[]).includes(b.status)) return true;
  const start = bookingStartTime(b);
  return !!start && start.getTime() < now;
}

/** True when this booking is still ahead — the only state a customer can cancel. */
export function isUpcomingBooking(b: Booking, now: number = Date.now()): boolean {
  return b.status === 'CONFIRMED' && !isFinishedBooking(b, now);
}

/** True when real money was captured for this booking through the payment gateway. */
export function isOnlinePaidBooking(b: Booking | undefined): boolean {
  if (!b) return false;
  // Either signal alone is enough: `paymentMethod` is the booking's own record,
  // and `paymentId` is only ever set once a verified payment confirmed it.
  return b.paymentMethod === 'ONLINE' || Boolean(b.paymentId);
}

/**
 * What to tell a customer about their money *before* they confirm a
 * cancellation — the last thing they read before deciding, so it has to be
 * exact.
 *
 * Bookings are non-refundable. This copy previously claimed the opposite in
 * both directions at different times (first "nothing was ever charged", later
 * "we'll refund you in 5-7 days"), and each version generated its own support
 * problem. State the actual outcome: the slot is released, the money is not
 * returned.
 */
export function cancellationRefundCopy(b: Booking | undefined): string {
  const amount = b?.amount ?? 0;
  if (isOnlinePaidBooking(b)) {
    return `The ₹${amount} you paid is non-refundable — cancelling releases your slot so the venue can resell it, but the amount is not returned. Only cancel if you're sure you can't make it.`;
  }
  return `No online payment was taken for this booking. Cancelling just releases the slot — settle anything you owe with the venue directly.`;
}
