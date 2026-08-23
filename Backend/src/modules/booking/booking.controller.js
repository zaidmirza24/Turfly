import * as bookingService from "./booking.service.js";
import * as paymentService from "../payment/payment.service.js";
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

// Cancellation-triggered refund + notification is orchestrated here rather
// than inside booking.service.js to avoid a circular import (payment.service
// already depends on booking.service for its own slot-claiming logic).
// Refund/email failures are caught and logged, never surfaced as a failure
// of the cancellation itself — the booking is already cancelled by the time
// either of these runs (Phase 20: notification/refund-attempt failures must
// not roll back a state change that already succeeded).
const afterCancellation = async (booking) => {
  let refundInfo = { refunded: false };
  try {
    refundInfo = await paymentService.initiateRefundForBooking(booking, {
      initiatedBy: booking.cancelledBy === "CUSTOMER" ? "CUSTOMER_CANCELLATION" : booking.cancelledBy === "ADMIN" ? "ADMIN_CANCELLATION" : "OWNER_CANCELLATION",
    });
  } catch (err) {
    log.error("Refund orchestration threw unexpectedly", { err, bookingId: booking._id });
  }
  await emailService.sendBookingCancelled(booking, refundInfo).catch((err) =>
    log.error("Failed to send booking-cancelled email", { err, bookingId: booking._id })
  );
  await emailService.sendOwnerBookingCancelled(booking).catch((err) =>
    log.error("Failed to send owner-cancellation email", { err, bookingId: booking._id })
  );
  return refundInfo;
};

export const cancelBooking = async (req, res) => {
  const booking = await bookingService.cancelBooking(
    req.user._id,
    req.params.id
  );
  const refundInfo = await afterCancellation(booking);
  new ApiResponse(200, "Booking cancelled successfully", { booking, refund: refundInfo }).send(res);
};

export const cancelBookingAsOwner = async (req, res) => {
  const booking = await bookingService.cancelBookingAsOwner(
    req.user,
    req.params.id,
    req.body.reason
  );
  const refundInfo = await afterCancellation(booking);
  new ApiResponse(200, "Booking cancelled successfully", { booking, refund: refundInfo }).send(res);
};

export const markBookingRefunded = async (req, res) => {
  const booking = await bookingService.markBookingRefunded(req.user, req.params.id);
  new ApiResponse(200, "Booking marked as refunded", booking).send(res);
};

export const createManualBooking = async (req, res) => {
  const bookings = await bookingService.createManualBooking(req.user._id, req.body);
  new ApiResponse(201, "Booking created", bookings).send(res);
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
  const { page, limit } = req.query;
  const bookings = await bookingService.getBookingsByTurf(req.user._id, req.params.turfId, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Turf bookings fetched successfully", bookings).send(
    res
  );
};

export const getOwnerBookings = async (req, res) => {
  const { page, limit, from, to, turfId, status, paymentStatus, refundStatus } = req.query;
  const bookings = await bookingService.getOwnerBookings(req.user._id, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    from,
    to,
    turfId,
    status,
    paymentStatus,
    refundStatus,
  });
  new ApiResponse(200, "Owner bookings fetched successfully", bookings).send(
    res
  );
};
