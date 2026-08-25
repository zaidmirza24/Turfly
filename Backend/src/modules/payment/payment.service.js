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
import { getRazorpayClient, verifyPaymentSignature } from "./razorpay.client.js";
import { toRupees } from "../../common/utils/money.js";
import { isRazorpayConfigured } from "../../common/config/env.js";
import env from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import * as emailService from "../notification/email.service.js";
import { getCommissionRate } from "../settings/settings.service.js";

const RESERVATION_MS = env.PAYMENT_RESERVATION_MINUTES * 60 * 1000;

const log = logger.child({ module: "payment" });

/**
 * Commission split for one ONLINE booking's `amountPaise`, computed once at
 * booking-confirmation time (below) and stored on the Booking rather than
 * derived later, so a future commission-rate change (admin-editable via
 * settings.service.js, seeded from PLATFORM_COMMISSION_RATE) never silently
 * reprices an already-confirmed booking. Single rounding, in integer paise:
 * ownerAmountPaise is the exact remainder, so the two halves always sum back
 * to amountPaise with no risk of a second rounding disagreeing by a paise.
 */
const computeCommissionSplit = async (amountPaise) => {
  const commissionRate = await getCommissionRate();
  const commissionAmountPaise = Math.round(amountPaise * commissionRate);
  const ownerAmountPaise = amountPaise - commissionAmountPaise;
  return { commissionAmountPaise, ownerAmountPaise };
};

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
  }).select("pricePaise lockedPricePaise");

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
  const amountPaise = lockedSlots.reduce((sum, s) => sum + (s.lockedPricePaise ?? s.pricePaise), 0);
  if (amountPaise <= 0) {
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
      amountPaise,
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
      amount: amountPaise,
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
    amountPaise,
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
      amount: payment.amountPaise,
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
    amount: payment.amountPaise,
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
    // Logged because this branch is otherwise completely silent: it returns a
    // 200 with no state change, so a verify that lands here looks identical
    // in the access log to one that created bookings. `status` is the useful
    // bit — a terminal status (PAID_BOOKING_FAILED/REFUNDED) means the other
    // caller already failed, not that it's still in flight.
    log.info("Payment finalize skipped — already claimed by another caller", {
      paymentId: current?._id,
      status: current?.status,
      bookingCount: current?.bookingIds?.length ?? 0,
      source,
    });
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
      // Tracked the instant confirmSlot commits it, before the enrichment
      // below — everything after this point can still throw (a commission
      // lookup, a write), and the catch's rollback can only cancel bookings
      // it knows about. Pushing later would leave an already-CONFIRMED
      // booking, holding a BOOKED slot, attached to a payment this same
      // handler goes on to refund in full.
      createdBookings.push(booking);
      const { commissionAmountPaise, ownerAmountPaise } = await computeCommissionSplit(booking.amountPaise);
      await Booking.findByIdAndUpdate(booking._id, {
        paymentId: claimed._id,
        paymentMethod: "ONLINE",
        commissionAmountPaise,
        ownerAmountPaise,
        payoutStatus: "PENDING",
      });
      // Persisted after *every* booking, not just once the whole loop
      // finishes: if this function is killed mid-loop (serverless timeout,
      // crash, deploy), Payment.bookingIds still reflects exactly how far it
      // got, instead of staying `[]` on a payment that's already PAID —
      // which is what makes findStuckPayments/reconcileStuckPayment (below)
      // able to tell "nothing happened yet" apart from "partially completed"
      // and finish the rest rather than re-doing or losing bookings.
      await Payment.findByIdAndUpdate(claimed._id, { $push: { bookingIds: booking._id } });
    }
  } catch (err) {
    // Roll back any bookings this call itself created, then treat the whole
    // payment as captured-but-unfulfillable and auto-refund it in full —
    // the customer must never be left having paid for nothing.
    await Promise.all(createdBookings.map((b) => forceCancelForSystem(b._id, "Slot lost after payment — auto-refunded")));
    await Payment.findByIdAndUpdate(claimed._id, { status: "PAID_BOOKING_FAILED" });
    // `err` alone serializes to `{}` for a Mongoose ValidationError (its
    // detail hangs off non-enumerable props), which is what made this failure
    // mode unreadable in the first place — pull the useful fields out by hand.
    log.error("Payment captured but slot claim failed — refunding", {
      paymentId: claimed._id,
      slotIds: claimed.slotIds.map(String),
      bookingsCreatedBeforeFailure: createdBookings.length,
      errName: err?.name,
      errMessage: err?.message,
      validationErrors: err?.errors
        ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]))
        : undefined,
      stack: err?.stack,
    });

    const refunded = await refundPaymentInternal(claimed, {
      amountPaise: claimed.amountPaise,
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

// ── Stuck-payment reconciliation (admin-triggered) ──────────────────────

const STUCK_PAYMENT_MINUTES = 15;

/**
 * Payments that captured real money (status PAID) but whose booking creation
 * never finished — the one genuinely dangerous crash window in
 * finalizePaymentSuccess: killed mid-loop (serverless timeout, OOM, a
 * mid-request deploy) after the atomic PAID claim but before every slot was
 * confirmed. Detected by comparing `bookingIds.length` against
 * `slotIds.length` rather than just "bookingIds is empty", since
 * `bookingIds` is now pushed to incrementally as each slot is confirmed (see
 * `finalizePaymentSuccess` above) — a crash can land after some, not zero,
 * slots were booked. Bounded to payments older than STUCK_PAYMENT_MINUTES so
 * an order that's simply still in flight isn't flagged as stuck.
 */
// This is an ops/support surface (see admin.controller.js's getStuckPayments
// doc comment) expected to stay small — a crash between capture and booking
// creation should be rare. STUCK_PAYMENT_QUERY_CAP is a defensive ceiling on
// the raw DB fetch, not a real pagination boundary: the actual "is a slot
// still missing" check can't be expressed as a Mongo filter (it compares two
// array lengths on the same document), so it has to run in JS after fetch —
// paginating that filtered result would be pagination theatre over a list
// that's supposed to be near-empty. If this cap is ever hit in practice,
// that's itself a signal something upstream is failing repeatedly.
const STUCK_PAYMENT_QUERY_CAP = 500;

export const findStuckPayments = async ({ page = 1, limit = 20 } = {}) => {
  const cutoff = new Date(Date.now() - STUCK_PAYMENT_MINUTES * 60 * 1000);
  const candidates = await Payment.find({ status: "PAID", paidAt: { $lt: cutoff } })
    .select("status userId turfId slotIds bookingIds amountPaise paidAt groupId razorpayPaymentId")
    .sort({ paidAt: 1 })
    .limit(STUCK_PAYMENT_QUERY_CAP)
    .lean();
  const stuck = candidates
    .filter((p) => (p.bookingIds?.length || 0) < p.slotIds.length)
    .map(({ amountPaise, ...rest }) => ({ ...rest, amount: toRupees(amountPaise) }));

  const total = stuck.length;
  const start = (page - 1) * limit;
  return { items: stuck.slice(start, start + limit), total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Admin-triggered recovery for one stuck payment (see findStuckPayments).
 * Finishes what finalizePaymentSuccess didn't: confirms whichever of this
 * payment's slots are still unclaimed. If even one of them can no longer be
 * claimed — someone else's checkout took it in the meantime, the same race
 * finalizePaymentSuccess's own catch block already handles for a
 * non-crashed run — the whole payment is rolled back and fully refunded
 * instead of left half-fulfilled, exactly like the crash-free path would do.
 */
export const reconcileStuckPayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND");
  if (payment.status !== "PAID") {
    throw new ApiError(400, `Only a PAID payment can be reconciled (current status: ${payment.status})`);
  }

  const alreadyBooked = await Booking.find({ _id: { $in: payment.bookingIds } }).select("_id slotId");
  const alreadyBookedSlotIds = new Set(alreadyBooked.map((b) => b.slotId.toString()));
  const missingSlotIds = payment.slotIds.map(String).filter((id) => !alreadyBookedSlotIds.has(id));

  if (missingSlotIds.length === 0) {
    // Nothing was actually missing — bookingIds just hadn't caught up to
    // reality (or this payment was already fixed). Reconcile the array and
    // stop; no new bookings, no refund.
    await Payment.findByIdAndUpdate(payment._id, { bookingIds: alreadyBooked.map((b) => b._id) });
    return { payment: await Payment.findById(payment._id), recovered: [], alreadyComplete: true };
  }

  const groupId = payment.slotIds.length > 1 ? payment.groupId : null;
  const recovered = [];
  try {
    for (const slotId of missingSlotIds) {
      const booking = await confirmSlot(payment.userId, slotId, groupId);
      const { commissionAmountPaise, ownerAmountPaise } = await computeCommissionSplit(booking.amountPaise);
      await Booking.findByIdAndUpdate(booking._id, {
        paymentId: payment._id,
        paymentMethod: "ONLINE",
        commissionAmountPaise,
        ownerAmountPaise,
        payoutStatus: "PENDING",
      });
      recovered.push(booking);
      await Payment.findByIdAndUpdate(payment._id, { $push: { bookingIds: booking._id } });
    }
  } catch (err) {
    // Same failure handling as the crash-free path: can't complete the set,
    // so nothing is kept — roll back whatever this call recovered *and*
    // whatever had already been booked before reconciliation ran, then
    // refund the whole payment in full.
    await Promise.all(
      [...recovered, ...alreadyBooked].map((b) =>
        forceCancelForSystem(b._id, "Slot lost during stuck-payment reconciliation — auto-refunded")
      )
    );
    await Payment.findByIdAndUpdate(payment._id, { status: "PAID_BOOKING_FAILED", bookingIds: [] });
    log.error("Stuck-payment reconciliation failed — refunding", { paymentId: payment._id, err });

    const refunded = await refundPaymentInternal(payment, {
      amountPaise: payment.amountPaise,
      initiatedBy: "SYSTEM",
      reason: "Slot no longer available during stuck-payment reconciliation",
    });
    await emailService.sendPaymentSucceededBookingFailed(payment).catch((e) =>
      log.error("Failed to send payment-succeeded-booking-failed email", { err: e, paymentId: payment._id })
    );
    return { payment: await Payment.findById(payment._id), recovered: [], bookingFailed: true, refund: refunded };
  }

  const finalPayment = await Payment.findById(payment._id);
  await emailService
    .sendBookingConfirmed([...alreadyBooked, ...recovered], finalPayment)
    .catch((e) => log.error("Failed to send booking confirmation email", { err: e, paymentId: finalPayment._id }));
  log.info("Stuck payment reconciled", { paymentId: payment._id, recoveredCount: recovered.length });
  return { payment: finalPayment, recovered };
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

// ── Refunds ─────────────────────────────────────────────────────────────
//
// There is no customer-facing refund feature: cancelling a booking frees the
// slot and returns no money. What remains here is deliberate and narrower:
//
//  - refundPaymentInternal is used when a payment was captured but the booking
//    could not be created at all (finalizePaymentSuccess / reconcileStuckPayment).
//    Keeping money for something never delivered is not a policy choice.
//  - the refund webhook handlers below reconcile a refund issued by hand from
//    the Razorpay dashboard — a dispute, a chargeback, a goodwill call. Without
//    them the booking would stay CONFIRMED, its slot stay BOOKED, and the owner
//    still be paid out for money the platform gave back.

const refundPaymentInternal = async (payment, { amountPaise, initiatedBy, notes, reason }) => {
  if (!payment.razorpayPaymentId) {
    throw new ApiError(400, "REFUND_FAILED: no captured payment to refund");
  }
  const already = payment.refundedAmount();
  if (already + amountPaise > payment.amountPaise) {
    throw new ApiError(400, "REFUND_FAILED: refund amount exceeds what was paid");
  }

  const razorpay = getRazorpayClient();
  const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
    amount: amountPaise,
    speed: "normal",
    notes: notes || {},
  });

  // Guarded rather than a bare $push: Razorpay's `refund.created` webhook for
  // this same refund can arrive before this line runs (the API call above has
  // already returned by then, so the refund exists on their side), and
  // upsertRefundEntry would insert its own entry for it. An unguarded push
  // then adds a second entry for one refund, which double-counts in
  // `refundedAmount()` — and that total is what guards against over-refunding,
  // so the consequence is a later legitimate refund being wrongly rejected as
  // exceeding what was paid. The $ne filter makes whichever writer arrives
  // second a no-op instead.
  const pushed = await Payment.findOneAndUpdate(
    { _id: payment._id, "refunds.razorpayRefundId": { $ne: refund.id } },
    {
      $push: {
        refunds: {
          razorpayRefundId: refund.id,
          amountPaise,
          status: refund.status === "processed" ? "PROCESSED" : "CREATED",
          speed: refund.speed_processed || refund.speed_requested || null,
          notes: notes || null,
          initiatedBy,
          failureReason: reason || null,
          createdAt: new Date(),
          processedAt: refund.status === "processed" ? new Date() : null,
        },
      },
      // Payment.status is deliberately left at PAID regardless of how much of
      // it has since been refunded — PAID means "this order was successfully
      // captured," which stays true forever; refund progress lives on the
      // Booking (refundStatus) and this document's own refunds[] array instead.
    }
  );

  if (!pushed) {
    // The webhook got there first. Its entry is missing the context only this
    // path knows — who asked for the refund, and which booking it covers —
    // and `notes.bookingId` in particular is what finalizeRefundIfComplete
    // matches on to decide this was an in-app refund rather than one issued
    // from the Razorpay dashboard. Backfill those without disturbing the
    // status the webhook set, which is more current than ours.
    await Payment.findOneAndUpdate(
      { _id: payment._id, "refunds.razorpayRefundId": refund.id },
      {
        $set: {
          "refunds.$.initiatedBy": initiatedBy,
          "refunds.$.notes": notes || null,
          "refunds.$.failureReason": reason || null,
        },
      }
    );
    log.info("Refund entry already recorded by webhook — backfilled attribution", {
      paymentId: payment._id,
      razorpayRefundId: refund.id,
    });
  }

  log.info("Refund initiated", { paymentId: payment._id, razorpayRefundId: refund.id, amountPaise });
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

/**
 * Records one refund webhook event on the Payment's `refunds[]` array,
 * entirely via atomic updates — never a load-mutate-`.save()` round trip.
 * That matters here specifically because `refund.created` and
 * `refund.processed` for the *same* refund are different webhook dedupe
 * keys (`buildDedupeKey` is `event:entityId`), so they can legitimately be
 * delivered and processed concurrently; a read-modify-write here would let
 * one delivery's in-memory copy silently overwrite the other's update
 * (whichever `.save()` lands second wins, full stop). Every other mutation
 * in this file already goes through `findOneAndUpdate` for the same reason.
 */
const upsertRefundEntry = async (refundEntity, status) => {
  const processedAt = status === "PROCESSED" ? new Date() : null;

  // Case 1: an entry for this refund id already exists — update it in place
  // via the positional operator, atomically.
  const updated = await Payment.findOneAndUpdate(
    { razorpayPaymentId: refundEntity.payment_id, "refunds.razorpayRefundId": refundEntity.id },
    {
      $set: {
        "refunds.$.status": status,
        ...(processedAt ? { "refunds.$.processedAt": processedAt } : {}),
      },
    },
    { new: true }
  );
  if (updated) return updated;

  // Case 2: no entry yet — atomically push one, guarded so a concurrent
  // first-sighting of the same refund can't create two entries for it.
  const pushed = await Payment.findOneAndUpdate(
    { razorpayPaymentId: refundEntity.payment_id, "refunds.razorpayRefundId": { $ne: refundEntity.id } },
    {
      $push: {
        refunds: {
          razorpayRefundId: refundEntity.id,
          // Razorpay's webhook payload is natively paise — no conversion needed.
          amountPaise: refundEntity.amount,
          status,
          initiatedBy: "SYSTEM",
          createdAt: new Date(),
          processedAt,
        },
      },
    },
    { new: true }
  );
  if (pushed) return pushed;

  // Lost the race — a concurrent delivery inserted it between the two
  // findOneAndUpdate calls above. It exists now; go update it (case 1 again).
  const existing = await Payment.findOneAndUpdate(
    { razorpayPaymentId: refundEntity.payment_id, "refunds.razorpayRefundId": refundEntity.id },
    {
      $set: {
        "refunds.$.status": status,
        ...(processedAt ? { "refunds.$.processedAt": processedAt } : {}),
      },
    },
    { new: true }
  );
  if (!existing) {
    log.warn("Refund webhook for unknown payment id", { razorpayPaymentId: refundEntity.payment_id });
  }
  return existing;
};

/**
 * Applies one refund's consequences to a single booking: marks it refunded,
 * and voids (or flags CLAWBACK_OWED on) whatever payout state it was in —
 * a refunded booking never owes the owner anything, and the platform never
 * actually keeps a commission on money it gave back. If `cancel` is true and
 * the booking isn't already CANCELLED, it's cancelled and its slot released
 * too — needed for a refund this app didn't itself initiate (see caller).
 */
const applyRefundToBooking = async (booking, payment, refundEntity, refundAmountPaise, { cancel = false } = {}) => {
  booking.refundStatus = "REFUNDED";
  booking.refundAmountPaise = (booking.refundAmountPaise || 0) + refundAmountPaise;
  if (booking.payoutStatus === "PENDING") {
    booking.payoutStatus = "VOID";
  } else if (booking.payoutStatus === "PAID") {
    // CLAWBACK_OWED just flags it for admin (GET /admin/payouts/clawbacks) —
    // nothing here reverses an already-settled payout automatically.
    booking.payoutStatus = "CLAWBACK_OWED";
  }
  if (cancel && booking.status !== "CANCELLED") {
    booking.status = "CANCELLED";
    booking.cancelledBy = "SYSTEM";
    booking.notes = booking.notes || "Refunded outside the app — booking auto-cancelled to match";
    await Slot.findByIdAndUpdate(booking.slotId, {
      status: "AVAILABLE",
      bookingId: null,
      lockedBy: null,
      lockExpiresAt: null,
      lockedPricePaise: null,
    });
  }
  await booking.save();
  await emailService.sendRefundCompleted(booking, payment, refundEntity.id).catch((e) =>
    log.error("Failed to send refund-completed email", { err: e, bookingId: booking._id })
  );
};

const finalizeRefundIfComplete = async (payment, refundEntity) => {
  const totalRefunded = payment.refundedAmount();
  const bookings = await Booking.find({ paymentId: payment._id });

  // This app never requests refunds itself (cancellation just voids the
  // payout, see booking.service.js) — every refund reaching this webhook was
  // issued directly from the Razorpay dashboard, the normal thing a support
  // person does under pressure. If this refund brings the payment to fully
  // refunded, reconcile every booking under it — cancel and release the slot
  // if it isn't already, and void/clawback the payout either way, since a
  // booking cancelled through the app already has its payout voided but one
  // that was already PAID out before this dashboard refund still needs
  // flagging. A *partial* unattributed refund can't be safely auto-applied to
  // one booking out of several in a multi-slot group — that's flagged for a
  // human instead of guessing which one it covered.
  if (bookings.length === 0) {
    log.info("Refund processed (no bookings to reconcile)", {
      paymentId: payment._id,
      totalRefunded,
      razorpayRefundId: refundEntity.id,
    });
    return;
  }

  if (totalRefunded < payment.amountPaise) {
    log.error("Unattributed partial refund — needs manual admin reconciliation", {
      paymentId: payment._id,
      razorpayRefundId: refundEntity.id,
      totalRefunded,
      paymentAmountPaise: payment.amountPaise,
    });
    return;
  }

  log.warn("Externally-initiated refund — reconciling all bookings under this payment", {
    paymentId: payment._id,
    razorpayRefundId: refundEntity.id,
    bookingCount: bookings.length,
  });
  for (const booking of bookings) {
    await applyRefundToBooking(booking, payment, refundEntity, booking.amountPaise, { cancel: true });
  }

  log.info("Refund processed", { paymentId: payment._id, totalRefunded, razorpayRefundId: refundEntity.id });
};
