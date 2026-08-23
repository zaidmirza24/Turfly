import { randomUUID } from "crypto";
import mongoose from "mongoose";
import Payment from "./payment.model.js";
import WebhookEvent from "./webhookEvent.model.js";
import Booking from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import Turf from "../turf/turf.model.js";
import User from "../user/user.model.js";
import {
  validateSlotSelection,
  confirmSlot,
  forceCancelForSystem,
} from "../booking/booking.service.js";
import { getRazorpayClient, toPaise, toRupees, verifyPaymentSignature } from "./razorpay.client.js";
import { isRazorpayConfigured } from "../../common/config/env.js";
import env from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import * as emailService from "../notification/email.service.js";

const RESERVATION_MS = env.PAYMENT_RESERVATION_MINUTES * 60 * 1000;

const log = logger.child({ module: "payment" });

/**
 * Extends the slot lock(s) this payment covers to the (longer) payment
 * reservation window, atomically and only if still held by this user. If any
 * slot has already slipped out of this user's hold — someone else's checkout
 * raced past it, or the original 5-minute lock simply expired first — the
 * whole order creation is refused rather than proceeding with a partial
 * reservation.
 */
const extendReservation = async (userId, slotIds) => {
  const lockExpiresAt = new Date(Date.now() + RESERVATION_MS);
  const result = await Slot.updateMany(
    { _id: { $in: slotIds }, status: "LOCKED", lockedBy: userId },
    { lockExpiresAt }
  );
  if (result.modifiedCount !== slotIds.length) {
    throw new ApiError(409, "Your slot hold expired — please select the slot(s) again");
  }
};

/**
 * The frontend always calls POST /bookings/lock-multi *before* this endpoint
 * (see booking.controller.js#lockMultipleSlots) — so by the time an order is
 * being created, the slots are already LOCKED by this user. This must not
 * attempt to re-lock them: lockSlot's atomic filter only matches AVAILABLE or
 * expired-LOCKED slots, so calling it again on a slot this same user already
 * holds fails with a 409 ("Slot is not available for booking") every time,
 * because a fresh, still-valid lock matches neither branch of that filter.
 * This instead just confirms the hold is real and reads the price that was
 * snapshotted when it was taken.
 */
const getAlreadyLockedSlots = async (userId, slotIds) => {
  const { uniqueIds, turfId } = await validateSlotSelection(slotIds);
  const lockedSlots = await Slot.find({
    _id: { $in: uniqueIds },
    status: "LOCKED",
    lockedBy: userId,
  }).select("price lockedPrice");

  if (lockedSlots.length !== uniqueIds.length) {
    throw new ApiError(
      409,
      "Your slot hold has expired or was lost — please select the slot(s) again before paying"
    );
  }
  return { uniqueIds, turfId, lockedSlots };
};

/**
 * Phase 4 — POST /payments/create-order.
 *
 * `groupId`, if the client has one from a previous attempt on this same
 * checkout, lets a retry (failed payment, double-click, page refresh, second
 * tab) reuse the same Razorpay order rather than creating a new one — Razorpay
 * supports multiple payment attempts against one unpaid order natively, and
 * reusing it is what keeps a double-click from ever producing two orders (or
 * later, two bookings) for the same slot selection.
 */
export const createOrGetOrder = async (user, { slotIds, groupId }) => {
  if (!isRazorpayConfigured()) {
    throw new ApiError(503, "Online payments are not configured on this server");
  }

  // Retry path: caller already has a Payment for this checkout session.
  if (groupId) {
    const existing = await Payment.findOne({ groupId, userId: user._id });
    if (existing) {
      return resumeExistingOrder(user, existing);
    }
    // Unknown/foreign groupId — fall through and treat as a fresh checkout
    // rather than trusting client-supplied state we have no record of.
  }

  const { uniqueIds, turfId, lockedSlots } = await getAlreadyLockedSlots(user._id, slotIds);
  await extendReservation(user._id, uniqueIds);

  // Charge the price snapshotted at lock time (server truth), never a
  // client-supplied amount — Phase 4, rule 6.
  const amount = lockedSlots.reduce((sum, s) => sum + (s.lockedPrice ?? s.price), 0);
  if (amount <= 0) {
    throw new ApiError(400, "Invalid booking amount");
  }

  const newGroupId = randomUUID();
  const receipt = `rcpt_${newGroupId.replace(/-/g, "").slice(0, 32)}`;

  let payment;
  try {
    payment = await Payment.create({
      userId: user._id,
      turfId,
      slotIds: uniqueIds,
      groupId: newGroupId,
      amount,
      currency: "INR",
      receipt,
      status: "CREATED",
    });
  } catch (err) {
    if (err.code === 11000) {
      // Extremely unlikely UUID collision on groupId/receipt — safe to retry
      // once with a fresh id rather than surfacing a confusing 500.
      throw new ApiError(409, "Could not start checkout — please try again");
    }
    throw err;
  }

  const razorpay = getRazorpayClient();
  let order;
  try {
    order = await razorpay.orders.create({
      amount: toPaise(amount),
      currency: "INR",
      receipt,
      notes: { paymentId: String(payment._id), groupId: newGroupId, userId: String(user._id) },
    });
  } catch (err) {
    payment.status = "FAILED";
    payment.failureReason = "PAYMENT_ORDER_CREATION_FAILED";
    await payment.save();
    log.error("Razorpay order creation failed", { err, paymentId: payment._id });
    throw new ApiError(502, "Could not initiate payment — please try again");
  }

  payment.razorpayOrderId = order.id;
  payment.status = "ORDER_CREATED";
  await payment.save();

  log.info("Payment order created", {
    paymentId: payment._id,
    razorpayOrderId: order.id,
    amount,
    slotCount: uniqueIds.length,
  });

  return buildCheckoutPayload(payment, user);
};

const resumeExistingOrder = async (user, payment) => {
  if (payment.status === "PAID") {
    // Idempotent success response — a client racing a duplicate click after
    // success already landed should see the same outcome, not an error.
    return { alreadyPaid: true, paymentId: payment._id, bookingIds: payment.bookingIds };
  }
  if (payment.status === "PAID_BOOKING_FAILED") {
    throw new ApiError(409, "PAYMENT_ALREADY_COMPLETED: this payment was already processed");
  }
  if (!["CREATED", "ORDER_CREATED", "AUTHORIZED", "FAILED"].includes(payment.status)) {
    throw new ApiError(409, "This checkout session can no longer be resumed");
  }

  // Re-validate the underlying slots are still held by this user — an order
  // can be "ORDER_CREATED" while the lock has since lapsed if the customer
  // walked away and came back after the reservation window closed.
  await extendReservation(user._id, payment.slotIds);

  if (!payment.razorpayOrderId) {
    // CREATED but the Razorpay call never completed last time — create it now.
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: toPaise(payment.amount),
      currency: "INR",
      receipt: payment.receipt,
      notes: { paymentId: String(payment._id), groupId: payment.groupId, userId: String(user._id) },
    });
    payment.razorpayOrderId = order.id;
  }
  payment.status = "ORDER_CREATED";
  await payment.save();

  return buildCheckoutPayload(payment, user);
};

const buildCheckoutPayload = async (payment, user) => {
  const turf = await Turf.findById(payment.turfId).select("name location");
  return {
    keyId: env.RAZORPAY_KEY_ID,
    paymentId: payment._id,
    groupId: payment.groupId,
    orderId: payment.razorpayOrderId,
    amount: toPaise(payment.amount),
    currency: payment.currency,
    name: "Turf Booking",
    description: turf ? `Booking at ${turf.name}` : "Turf booking",
    prefill: { name: user.name, email: user.email, contact: user.phone || undefined },
    notes: { paymentId: String(payment._id) },
    // So the frontend can show a real "complete payment in Xm" countdown
    // instead of the reservation window being an invisible implementation
    // detail — extendReservation() (above) is what actually sets the slots'
    // lockExpiresAt to now + this many minutes, this just tells the client
    // what that number is.
    reservationMinutes: env.PAYMENT_RESERVATION_MINUTES,
  };
};

/**
 * The single authoritative PENDING_PAYMENT → PAID → booking-confirmed
 * transition (Phase 10). Called from exactly two places — the client
 * verification callback and the `payment.captured`/`order.paid` webhook —
 * and safe to call from both for the same payment, including concurrently:
 * the atomic `findOneAndUpdate` guard below ensures only one caller ever
 * proceeds to create bookings, and every retry against an already-PAID
 * or already-finalizing payment either no-ops or returns the existing result.
 *
 * Does NOT trust its caller's idea of the order id — `orderId` is compared
 * against the Payment record already stored in our own database (Phase 6),
 * so a forged/foreign order id can never be used to confirm someone else's
 * (or a nonexistent) payment.
 */
export const finalizePaymentSuccess = async ({ paymentDoc, razorpayOrderId, razorpayPaymentId, razorpaySignature, method, source }) => {
  if (razorpayOrderId !== paymentDoc.razorpayOrderId) {
    log.error("Payment verification: order id mismatch", {
      paymentId: paymentDoc._id,
      expected: paymentDoc.razorpayOrderId,
      received: razorpayOrderId,
      source,
    });
    throw new ApiError(400, "INVALID_PAYMENT_SIGNATURE: order does not match this payment");
  }

  // Atomic claim: only one concurrent caller (webhook vs. callback, or two
  // duplicate webhook deliveries) can flip CREATED/ORDER_CREATED/AUTHORIZED/
  // FAILED → PAID. Everyone else sees null here and falls through to "already
  // being handled" instead of racing to create bookings twice.
  const claimed = await Payment.findOneAndUpdate(
    { _id: paymentDoc._id, status: { $in: ["CREATED", "ORDER_CREATED", "AUTHORIZED", "FAILED"] } },
    {
      status: "PAID",
      razorpayPaymentId,
      razorpaySignature: razorpaySignature || null,
      paidAt: new Date(),
      $push: { attempts: { razorpayPaymentId, status: "CAPTURED", method: method || null, at: new Date() } },
    },
    { new: true }
  );

  if (!claimed) {
    // Someone else already finalized (or is finalizing) this payment. If
    // bookings already exist, this is a clean idempotent success; if not yet
    // (a genuine concurrent race), the other caller will finish momentarily —
    // the customer-facing poll (GET /payments/:id) will pick it up.
    const current = await Payment.findById(paymentDoc._id);
    return { payment: current, bookings: await Booking.find({ _id: { $in: current.bookingIds } }), deduped: true };
  }

  log.info("Payment captured and verified", {
    paymentId: claimed._id,
    razorpayOrderId,
    razorpayPaymentId,
    source,
  });

  // Claim each slot the same way a normal instant booking does — atomically,
  // LOCKED-by-this-user → BOOKED. If the reservation lapsed in the window
  // between "Razorpay captured the money" and "we got here" (server
  // restart, extreme slowness, clock skew) and someone else's checkout has
  // since taken the slot, this is the one genuinely dangerous edge case in
  // the whole flow: real money was captured but the slot can't be given to
  // this customer. Handled explicitly below rather than left to crash.
  const groupId = claimed.slotIds.length > 1 ? claimed.groupId : null;
  const createdBookings = [];
  try {
    for (const slotId of claimed.slotIds) {
      const booking = await confirmSlot(claimed.userId, slotId, groupId);
      await Booking.findByIdAndUpdate(booking._id, { paymentId: claimed._id, paymentMethod: "ONLINE" });
      createdBookings.push(booking);
    }
  } catch (err) {
    // Roll back any bookings this call itself created, then treat the whole
    // payment as captured-but-unfulfillable and auto-refund it in full —
    // the customer must never be left having paid for nothing.
    await Promise.all(createdBookings.map((b) => forceCancelForSystem(b._id, "Slot lost after payment — auto-refunded")));
    await Payment.findByIdAndUpdate(claimed._id, { status: "PAID_BOOKING_FAILED" });
    log.error("Payment captured but slot claim failed — refunding", { paymentId: claimed._id, err });

    const refunded = await refundPaymentInternal(claimed, {
      amount: claimed.amount,
      initiatedBy: "SYSTEM",
      reason: "Slot no longer available after payment",
    });

    await emailService.sendPaymentSucceededBookingFailed(claimed).catch((e) =>
      log.error("Failed to send payment-succeeded-booking-failed email", { err: e, paymentId: claimed._id })
    );

    return { payment: await Payment.findById(claimed._id), bookings: [], bookingFailed: true, refund: refunded };
  }

  await Payment.findByIdAndUpdate(claimed._id, { bookingIds: createdBookings.map((b) => b._id) });
  const finalPayment = await Payment.findById(claimed._id);

  // Notifications are best-effort and strictly after the money/booking state
  // is durable — Phase 20: an email failure must never roll back a real
  // payment or booking.
  await Promise.all([
    emailService.sendBookingConfirmed(createdBookings, finalPayment).catch((e) =>
      log.error("Failed to send booking confirmation email", { err: e, paymentId: finalPayment._id })
    ),
    emailService.sendPaymentSuccess(finalPayment, createdBookings).catch((e) =>
      log.error("Failed to send payment success email", { err: e, paymentId: finalPayment._id })
    ),
    emailService.sendOwnerNewBooking(createdBookings, finalPayment).catch((e) =>
      log.error("Failed to send owner new-booking email", { err: e, paymentId: finalPayment._id })
    ),
  ]);

  return { payment: finalPayment, bookings: createdBookings };
};

/**
 * Phase 6/7 — POST /payments/verify. The client-side callback is only ever
 * used as a signal to *check*, never as proof: this re-derives everything
 * from Razorpay's own signed payload and our own stored order id.
 */
export const verifyAndFinalizePayment = async (userId, { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  if (!mongoose.isValidObjectId(paymentId)) {
    throw new ApiError(400, "PAYMENT_NOT_FOUND");
  }
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND");
  if (payment.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "You do not own this payment");
  }

  if (payment.status === "PAID") {
    return { payment, bookings: await Booking.find({ _id: { $in: payment.bookingIds } }) };
  }

  // Cheap sanity check before doing any HMAC work: reject outright if the
  // client's claimed order id doesn't even match what we created. Genuinely
  // redundant with the check below once the signature is verified against
  // our own stored order id (not the client's), but failing fast here keeps
  // a buggy/malicious client from spending a wasted signature computation.
  if (razorpayOrderId !== payment.razorpayOrderId) {
    log.warn("Payment verify called with a mismatched order id", {
      paymentId: payment._id,
      expected: payment.razorpayOrderId,
      received: razorpayOrderId,
    });
    throw new ApiError(400, "INVALID_PAYMENT_SIGNATURE");
  }

  // Razorpay's own guidance: build the signature from the order id *your
  // server already has on record*, never the one the client hands back —
  // otherwise a genuinely-valid signature from an unrelated real payment the
  // same attacker made elsewhere (correct order_id/payment_id/signature
  // triple, just not for this booking) would pass an HMAC check computed
  // over client-supplied values. Using our own stored order id here means
  // the only way this ever validates is if Razorpay itself signed exactly
  // this (order, payment) pair.
  const validSignature = verifyPaymentSignature({
    orderId: payment.razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!validSignature) {
    await Payment.findByIdAndUpdate(payment._id, {
      $push: { attempts: { razorpayPaymentId, status: "FAILED", errorDescription: "Invalid signature", at: new Date() } },
    });
    log.warn("Razorpay signature verification failed", { paymentId: payment._id, razorpayOrderId, razorpayPaymentId });
    throw new ApiError(400, "INVALID_PAYMENT_SIGNATURE");
  }

  // Phase 7: confirm the payment is genuinely captured with Razorpay itself
  // before trusting the browser's callback — checkout completing, or the
  // browser reaching this endpoint at all, is not proof of payment.
  const razorpay = getRazorpayClient();
  const rpPayment = await razorpay.payments.fetch(razorpayPaymentId);
  if (rpPayment.status !== "captured") {
    log.warn("Payment verify called but Razorpay status is not captured", {
      paymentId: payment._id,
      razorpayStatus: rpPayment.status,
    });
    throw new ApiError(409, "PAYMENT_VERIFICATION_FAILED: payment is not captured yet");
  }

  const result = await finalizePaymentSuccess({
    paymentDoc: payment,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    method: rpPayment.method,
    source: "CALLBACK",
  });
  return result;
};

/** Customer/owner/admin read of one payment (for polling + receipts). */
export const getPaymentById = async (actor, paymentId) => {
  if (!mongoose.isValidObjectId(paymentId)) throw new ApiError(400, "PAYMENT_NOT_FOUND");
  const payment = await Payment.findById(paymentId).populate("bookingIds");
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND");
  if (actor.role === "USER" && payment.userId.toString() !== actor._id.toString()) {
    throw new ApiError(403, "You do not own this payment");
  }
  if (actor.role === "OWNER" && payment.turfId) {
    const turf = await Turf.findById(payment.turfId).select("ownerId");
    if (!turf || turf.ownerId.toString() !== actor._id.toString()) {
      throw new ApiError(403, "You do not own this turf");
    }
  }
  return payment;
};

// ── Refunds (Phase 13) ──────────────────────────────────────────────────

/**
 * Refunds a specific booking's share of its payment, in full — this platform
 * has exactly one cancellation policy (free cancellation up to 6 hours before
 * the slot, enforced in booking.service.js's cancelBooking/cancelBookingAsOwner),
 * with no partial/tiered refund schedule to apply, so "cancelled" and "fully
 * refund what was paid for this slot" are the same event. Never marks the
 * refund complete just because the Razorpay API call was accepted — that only
 * moves the state to REFUND_PENDING; `refund.processed` (webhook) is what
 * actually confirms it (Phase 13, explicit rule).
 */
export const initiateRefundForBooking = async (booking, { initiatedBy }) => {
  if (!booking.paymentId) {
    return { refunded: false, reason: "No online payment on this booking" };
  }
  const payment = await Payment.findById(booking.paymentId);
  if (!payment || payment.status !== "PAID") {
    return { refunded: false, reason: "Payment is not in a refundable state" };
  }

  // Atomic claim, mirroring finalizePaymentSuccess's pattern (Phase 10): two
  // concurrent cancellations of the same booking (double-click, retried
  // request, customer-cancel racing an owner-cancel) must not both pass a
  // plain read-then-write check on refundStatus and both call Razorpay's
  // refund API. Only the caller that actually flips NONE/REFUND_FAILED →
  // REFUND_PENDING here proceeds; everyone else sees null and backs off
  // immediately, before any refund call is made.
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, refundStatus: { $in: ["NONE", "REFUND_FAILED"] } },
    { refundStatus: "REFUND_PENDING" },
    { new: true }
  );
  if (!claimed) {
    return { refunded: false, reason: "Already refunded or refund already in progress" };
  }

  try {
    const result = await refundPaymentInternal(payment, {
      amount: booking.amount,
      initiatedBy,
      notes: { bookingId: String(booking._id) },
    });
    await emailService.sendRefundInitiated(booking, payment, result.razorpayRefundId).catch((e) =>
      log.error("Failed to send refund-initiated email", { err: e, bookingId: booking._id })
    );
    return { refunded: true, razorpayRefundId: result.razorpayRefundId };
  } catch (err) {
    await Booking.findByIdAndUpdate(booking._id, { refundStatus: "REFUND_FAILED" });
    log.error("Refund initiation failed", { err, bookingId: booking._id, paymentId: payment._id });
    return { refunded: false, reason: "REFUND_FAILED", error: err.message };
  }
};

const refundPaymentInternal = async (payment, { amount, initiatedBy, notes, reason }) => {
  if (!payment.razorpayPaymentId) {
    throw new ApiError(400, "REFUND_FAILED: no captured payment to refund");
  }
  const already = payment.refundedAmount();
  if (already + amount > payment.amount) {
    throw new ApiError(400, "REFUND_FAILED: refund amount exceeds what was paid");
  }

  const razorpay = getRazorpayClient();
  const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
    amount: toPaise(amount),
    speed: "normal",
    notes: notes || {},
  });

  await Payment.findByIdAndUpdate(payment._id, {
    $push: {
      refunds: {
        razorpayRefundId: refund.id,
        amount,
        status: refund.status === "processed" ? "PROCESSED" : "CREATED",
        speed: refund.speed_processed || refund.speed_requested || null,
        notes: notes || null,
        initiatedBy,
        failureReason: reason || null,
        createdAt: new Date(),
        processedAt: refund.status === "processed" ? new Date() : null,
      },
    },
    status: already + amount >= payment.amount ? "PAID" : "PAID", // status stays PAID; refund progress tracked on the Booking + refunds[]
  });

  log.info("Refund initiated", { paymentId: payment._id, razorpayRefundId: refund.id, amount });
  return { razorpayRefundId: refund.id };
};

// ── Webhooks (Phase 8) ──────────────────────────────────────────────────

export const buildDedupeKey = (event, entityId) => `${event}:${entityId}`;

/**
 * Processes one already-signature-verified webhook event. Idempotent by
 * design: the caller (payment.controller.js) inserts the WebhookEvent row
 * first via its unique `dedupeKey` index, and only calls this function if
 * that insert won the race — so this body never runs twice for the same
 * underlying event, even under concurrent redelivery.
 */
export const handleWebhookEvent = async (event, payload) => {
  switch (event) {
    case "payment.authorized": {
      const entity = payload.payload.payment.entity;
      await Payment.findOneAndUpdate(
        { razorpayOrderId: entity.order_id, status: { $in: ["CREATED", "ORDER_CREATED"] } },
        { status: "AUTHORIZED", $push: { attempts: { razorpayPaymentId: entity.id, status: "AUTHORIZED", method: entity.method, at: new Date() } } }
      );
      break;
    }

    case "payment.captured":
    case "order.paid": {
      const entity = payload.payload.payment.entity;
      const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
      if (!payment) {
        log.warn("Webhook for unknown order id", { event, orderId: entity.order_id });
        break;
      }
      await finalizePaymentSuccess({
        paymentDoc: payment,
        razorpayOrderId: entity.order_id,
        razorpayPaymentId: entity.id,
        razorpaySignature: null, // webhook auth is the HMAC on the whole body, not the checkout signature
        method: entity.method,
        source: "WEBHOOK",
      });
      break;
    }

    case "payment.failed": {
      const entity = payload.payload.payment.entity;
      const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: entity.order_id, status: { $ne: "PAID" } }, // never downgrade an already-paid payment
        {
          status: "FAILED",
          failureCode: entity.error_code || null,
          failureReason: entity.error_description || null,
          $push: {
            attempts: {
              razorpayPaymentId: entity.id,
              status: "FAILED",
              method: entity.method,
              errorCode: entity.error_code || null,
              errorDescription: entity.error_description || null,
              at: new Date(),
            },
          },
        },
        { new: true }
      );
      if (payment) {
        await emailService.sendPaymentFailure(payment).catch((e) =>
          log.error("Failed to send payment-failed email", { err: e, paymentId: payment._id })
        );
      }
      break;
    }

    case "refund.created": {
      const entity = payload.payload.refund.entity;
      await upsertRefundEntry(entity, "CREATED");
      break;
    }

    case "refund.processed": {
      const entity = payload.payload.refund.entity;
      const payment = await upsertRefundEntry(entity, "PROCESSED");
      if (payment) await finalizeRefundIfComplete(payment, entity);
      break;
    }

    case "refund.failed": {
      const entity = payload.payload.refund.entity;
      await upsertRefundEntry(entity, "FAILED");
      log.error("Razorpay reported a failed refund — needs manual follow-up", {
        razorpayRefundId: entity.id,
        razorpayPaymentId: entity.payment_id,
      });
      break;
    }

    default:
      log.debug("Unhandled Razorpay webhook event type", { event });
  }
};

const upsertRefundEntry = async (refundEntity, status) => {
  const payment = await Payment.findOne({ razorpayPaymentId: refundEntity.payment_id });
  if (!payment) {
    log.warn("Refund webhook for unknown payment id", { razorpayPaymentId: refundEntity.payment_id });
    return null;
  }
  const idx = payment.refunds.findIndex((r) => r.razorpayRefundId === refundEntity.id);
  if (idx >= 0) {
    payment.refunds[idx].status = status;
    if (status === "PROCESSED") payment.refunds[idx].processedAt = new Date();
  } else {
    payment.refunds.push({
      razorpayRefundId: refundEntity.id,
      amount: toRupees(refundEntity.amount),
      status,
      initiatedBy: "SYSTEM",
      createdAt: new Date(),
      processedAt: status === "PROCESSED" ? new Date() : null,
    });
  }
  await payment.save();
  return payment;
};

const finalizeRefundIfComplete = async (payment, refundEntity) => {
  const totalRefunded = payment.refundedAmount();
  const bookings = await Booking.find({ paymentId: payment._id });
  const refundedBooking = bookings.find((b) =>
    payment.refunds.some((r) => r.razorpayRefundId === refundEntity.id && r.notes?.bookingId === String(b._id))
  );

  if (refundedBooking) {
    refundedBooking.refundStatus = "REFUNDED";
    refundedBooking.refundAmount = (refundedBooking.refundAmount || 0) + toRupees(refundEntity.amount);
    await refundedBooking.save();
    await emailService.sendRefundCompleted(refundedBooking, payment, refundEntity.id).catch((e) =>
      log.error("Failed to send refund-completed email", { err: e, bookingId: refundedBooking._id })
    );
  }

  log.info("Refund processed", { paymentId: payment._id, totalRefunded, razorpayRefundId: refundEntity.id });
};
