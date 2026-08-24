import * as bookingService from "./booking.service.js";
import * as emailService from "../notification/email.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import logger from "../../common/utils/logger.js";

const log = logger.child({ module: "booking.controller" });

export const lockSlot = async (req, res) => {
  const slot = await bookingService.lockSlot(req.user._id, req.body.slotId);
  new ApiResponse(200, "Slot locked successfully", slot).send(res);
};

/**
 * POST /api/bookings/lock-multi — locks 1-10 contiguous slots on one turf
 * without confirming them. This is step 1 of the pay-then-confirm flow: the
 * frontend locks the slots here, then calls POST /api/payments/create-order
 * against the same slotIds. `bookingService.bookMultipleSlots` (lock+confirm
 * in one call, no payment) still exists as a plain function — it's used by
 * the owner-only manual/cash booking flow (createManualBooking below) — but
 * is deliberately not exposed over HTTP to a USER, since that would let a
 * customer confirm a booking without ever paying.
 */
export const lockMultipleSlots = async (req, res) => {
  const result = await bookingService.lockSlotsForCheckout(req.user._id, req.body.slotIds);
  new ApiResponse(200, "Slots locked successfully", result).send(res);
};

/**
 * POST /api/bookings/hold-summary — short 1-minute hold applied as soon as
 * the customer opens the booking summary screen, before they've committed to
 * paying. Distinct from lock-multi's 5-minute payment hold; see
 * bookingService.holdSlotsForSummary.
 */
export const holdSlotsForSummary = async (req, res) => {
  const result = await bookingService.holdSlotsForSummary(req.user._id, req.body.slotIds);
  new ApiResponse(200, "Slots held successfully", result).send(res);
};

/**
 * POST /api/bookings/release — explicit early release of a checkout hold
 * (payment popup dismissed, checkout abandoned) so the slot frees up
 * immediately instead of sitting LOCKED until its TTL expires. Never throws
 * on a hold that's already gone — releasing something that's already
 * released/expired/taken is a no-op, not an error, since the frontend fires
 * this opportunistically (popup dismiss, tab close) without knowing whether
 * the hold is still live.
 */
export const releaseLock = async (req, res) => {
  await bookingService.releaseCheckoutHold(req.user._id, req.body.slotIds);
  new ApiResponse(200, "Hold released", null).send(res);
};

export const getMyBookings = async (req, res) => {
  const bookings = await bookingService.getUserBookings(req.user._id);
  new ApiResponse(200, "Bookings fetched successfully", bookings).send(res);
};

// Cancelling frees the slot; it does not return money. That is a deliberate
// V1 product decision, not an unfinished feature: Razorpay keeps its gateway
// fee on a refund, and the platform's commission was being voided at the same
// time, so free cancellation with a full refund lost money on every use.
//
// Note what this does NOT remove. A payment captured for a booking that could
// not be created at all is still refunded in full (payment.service.js
// finalizePaymentSuccess) — that isn't a cancellation policy, it's not keeping
// money for something never delivered. And a refund issued by hand from the
// Razorpay dashboard (a dispute, a goodwill call) is still reconciled, so the
// booking cancels and the owner's payout is voided rather than the owner being
// paid for money the platform gave back.
//
// Email failures are caught and logged, never surfaced as a failure of the
// cancellation itself — the booking is already cancelled by the time this runs.
const afterCancellation = async (booking) => {
  await emailService.sendBookingCancelled(booking).catch((err) =>
    log.error("Failed to send booking-cancelled email", { err, bookingId: booking._id })
  );
  await emailService.sendOwnerBookingCancelled(booking).catch((err) =>
    log.error("Failed to send owner-cancellation email", { err, bookingId: booking._id })
  );
};

export const cancelBooking = async (req, res) => {
  const booking = await bookingService.cancelBooking(
    req.user._id,
    req.params.id
  );
  await afterCancellation(booking);
  new ApiResponse(200, "Booking cancelled successfully", { booking }).send(res);
};

export const cancelBookingAsOwner = async (req, res) => {
  const booking = await bookingService.cancelBookingAsOwner(
    req.user,
    req.params.id,
    req.body.reason
  );
  await afterCancellation(booking);
  new ApiResponse(200, "Booking cancelled successfully", { booking }).send(res);
};

export const markBookingNoShow = async (req, res) => {
  const booking = await bookingService.markBookingNoShow(req.user, req.params.id);
  new ApiResponse(200, "Booking marked as a no-show", booking).send(res);
};

export const createManualBooking = async (req, res) => {
  const bookings = await bookingService.createManualBooking(req.user._id, req.body);
  new ApiResponse(201, "Booking created", bookings).send(res);
};

export const getOwnerStats = async (req, res) => {
  const stats = await bookingService.getOwnerStats(req.user._id);
  new ApiResponse(200, "Owner stats fetched successfully", stats).send(res);
};

export const getOwnerCustomers = async (req, res) => {
  const { page, limit } = req.query;
  const customers = await bookingService.getOwnerCustomers(req.user._id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Customers fetched successfully", customers).send(res);
};

export const getOwnerCustomerDetail = async (req, res) => {
  const detail = await bookingService.getOwnerCustomerDetail(req.user._id, req.params.userId);
  new ApiResponse(200, "Customer detail fetched successfully", detail).send(res);
};

export const getTurfBookings = async (req, res) => {
  const { page, limit, status } = req.query;
  const bookings = await bookingService.getBookingsByTurf(req.user._id, req.params.turfId, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
  });
  new ApiResponse(200, "Turf bookings fetched successfully", bookings).send(
    res
  );
};

export const getOwnerBookings = async (req, res) => {
  const { page, limit, from, to, turfId, status, paymentStatus, refundStatus, payoutStatus } = req.query;
  const bookings = await bookingService.getOwnerBookings(req.user._id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    from,
    to,
    turfId,
    status,
    paymentStatus,
    refundStatus,
    payoutStatus,
  });
  new ApiResponse(200, "Owner bookings fetched successfully", bookings).send(
    res
  );
};

export const markBookingPaidOut = async (req, res) => {
  const booking = await bookingService.markBookingPaidOut(req.user._id, req.params.id, req.body);
  new ApiResponse(200, "Booking payout recorded", booking).send(res);
};
