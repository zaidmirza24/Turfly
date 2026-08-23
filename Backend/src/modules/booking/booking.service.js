import { randomUUID } from "crypto";
import mongoose from "mongoose";
import Slot from "../slot/slot.model.js";
import Booking from "./booking.model.js";
import Turf from "../turf/turf.model.js";
import User from "../user/user.model.js";
import Payment from "../payment/payment.model.js";
import { isTurfBookable } from "../turf/turf.service.js";
import { logAdminAction } from "../admin/admin.service.js";
import ApiError from "../../common/utils/ApiError.js";

// Verifies the caller owns the turf a booking belongs to. Every owner-only
// mutation/read on a booking goes through this — role alone is never enough,
// since any OWNER account could otherwise act on another owner's bookings.
const assertOwnsBookingTurf = async (ownerId, turfId) => {
  const turf = await Turf.findById(turfId).select("ownerId");
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }
  return turf;
};

// Same check, but for the cancel/refund routes an ADMIN can also reach —
// an admin isn't the turf's owner, so it skips the ownership match rather
// than failing it.
const assertCanManageBooking = async (actor, turfId) => {
  if (actor.role === "ADMIN") {
    const turf = await Turf.findById(turfId).select("ownerId");
    if (!turf) {
      throw new ApiError(404, "Turf not found");
    }
    return turf;
  }
  return assertOwnsBookingTurf(actor._id, turfId);
};

/**
 * Lock expiry duration (ms).
 * A locked slot auto-expires after this period if not confirmed.
 */
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Ceiling on how many slots one user may hold LOCKED at once, across every
// turf. Without this, one account can script repeated /lock calls to hold
// out a large share of near-term inventory in rolling 5-minute windows —
// each hold is individually legitimate, so nothing else here catches it.
// Set well above the largest real checkout (MAX_SLOTS_PER_BOOKING = 10).
const MAX_CONCURRENT_LOCKS_PER_USER = 15;

// A slot can't be locked if it starts further out than this — bounds how far
// into the future a booking can be made. Kept comfortably under
// MAX_PROVISION_DAYS (62, in slot.service.js) so it never rejects a slot that
// actually exists to be booked.
const MAX_ADVANCE_BOOKING_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Step 1 — Atomically lock a slot.
 *
 * Uses findOneAndUpdate with a status filter so that only ONE concurrent
 * request can win the lock. If two users hit the same slot at the exact
 * same millisecond, only one gets a non-null result — the other gets null
 * and receives a 409. This is the concurrency-safe replacement for the
 * old read-then-write pattern.
 */
export const lockSlot = async (userId, slotId) => {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  const maxBookableStart = new Date(now.getTime() + MAX_ADVANCE_BOOKING_MS);

  // A slot only sells if its turf is actually live. Slot documents exist for
  // turfs that are still awaiting admin review, were rejected, or that the
  // owner has deactivated — and slot ids are guessable and enumerable, so this
  // has to be enforced here rather than relying on the listing filter.
  const slotTurf = await Slot.findById(slotId).select("turfId").lean();
  if (!slotTurf) {
    throw new ApiError(404, "Slot not found");
  }
  const turf = await Turf.findById(slotTurf.turfId).select("isActive approvalStatus");
  if (!isTurfBookable(turf)) {
    throw new ApiError(409, "This turf is not currently accepting bookings");
  }

  // Soft cap, checked before attempting the lock: a count-then-act race can
  // let concurrent requests from the same user overshoot it by a slot or two,
  // which is fine for an abuse ceiling — it only needs to bound the damage,
  // not enforce it to the last slot the way slot-level locking does.
  const activeLocks = await Slot.countDocuments({
    lockedBy: userId,
    status: "LOCKED",
    lockExpiresAt: { $gt: now },
  });
  if (activeLocks >= MAX_CONCURRENT_LOCKS_PER_USER) {
    throw new ApiError(
      429,
      `You have too many slots on hold at once (max ${MAX_CONCURRENT_LOCKS_PER_USER}) — confirm or let one expire before locking another`
    );
  }

  // Atomic: succeeds if the slot is AVAILABLE, or if it's still marked
  // LOCKED but that lock has already expired. This branch is what makes lock
  // expiry correct without any scheduled job: an abandoned checkout stops
  // blocking the slot the moment its 5 minutes are up, whether or not
  // anything has swept the record.
  // An aggregation-pipeline update (array form) so `lockedPrice` can be set
  // from the slot's own current `price` field atomically, in the same
  // operation that wins the lock — a plain object update can't reference the
  // document's own pre-update field, and reading price in a separate query
  // first would reopen the race this whole function exists to close.
  const lockedSlot = await Slot.findOneAndUpdate(
    {
      _id: slotId,
      // Combines two time rules in one atomic check, so neither can race with
      // the status check below: the slot must not have started yet, and must
      // not be further than MAX_ADVANCE_BOOKING_MS in the future.
      startTime: { $gt: now, $lte: maxBookableStart },
      $or: [{ status: "AVAILABLE" }, { status: "LOCKED", lockExpiresAt: { $lt: now } }],
    },
    [
      {
        $set: {
          status: "LOCKED",
          lockedBy: userId,
          lockExpiresAt,
          lockedPrice: "$price",
        },
      },
    ],
    { new: true }
  );

  if (!lockedSlot) {
    // Either the slot doesn't exist, fails one of the time rules, or was
    // already LOCKED/BOOKED — figure out which so the error is actionable.
    const exists = await Slot.findById(slotId);
    if (!exists) {
      throw new ApiError(404, "Slot not found");
    }
    if (exists.startTime <= now) {
      throw new ApiError(400, "This slot has already started and can no longer be booked");
    }
    if (exists.startTime > maxBookableStart) {
      throw new ApiError(400, "This slot is too far in the future to be booked yet — try again closer to the date");
    }
    throw new ApiError(409, "Slot is not available for booking");
  }

  return lockedSlot;
};

/**
 * Step 2 — Confirm a locked slot → create booking.
 *
 * Only the user who locked the slot can confirm it.
 * In Phase 3 this is where payment verification would go
 * (between lock and confirm).
 */
export const confirmSlot = async (userId, slotId, groupId = null) => {
  // Atomic: only succeeds if slot is LOCKED by this user. `new: false`
  // (the default) returns the pre-update document, which is what still has
  // `lockedPrice` — the price snapshotted when the hold was created — before
  // this same update clears it back to null.
  const slotBeforeConfirm = await Slot.findOneAndUpdate(
    {
      _id: slotId,
      status: "LOCKED",
      lockedBy: userId,
    },
    {
      status: "BOOKED",
      lockedBy: null,
      lockExpiresAt: null,
      lockedPrice: null,
    }
  );

  if (!slotBeforeConfirm) {
    throw new ApiError(409, "Slot lock expired or was not locked by you");
  }

  // Charge the price snapshotted at lock time, not whatever `price` is now —
  // closes the window where an owner's price change during the 5-minute hold
  // would change what the customer actually pays.
  const chargedAmount = slotBeforeConfirm.lockedPrice ?? slotBeforeConfirm.price;

  // Create the booking record
  const booking = await Booking.create({
    userId,
    turfId: slotBeforeConfirm.turfId,
    slotId: slotBeforeConfirm._id,
    status: "CONFIRMED",
    amount: chargedAmount,
    groupId,
  });

  // Link booking to slot
  await Slot.findByIdAndUpdate(slotId, { bookingId: booking._id });

  // Denormalized popularity signal for listing sort/"recommended" — every
  // booking path (single, instant, multi) funnels through this one function,
  // so incrementing here is the single place that needs to know about it.
  await Turf.findByIdAndUpdate(slotBeforeConfirm.turfId, { $inc: { bookingCount: 1 } });

  return booking;
};

/**
 * Book a slot (convenience — lock + confirm in one call).
 *
 * For instant booking without payment flow.
 * When payment is added later, the frontend will call
 * lockSlot → payment → confirmSlot separately.
 */
export const bookSlot = async (userId, slotId) => {
  await lockSlot(userId, slotId);
  return confirmSlot(userId, slotId);
};

const MAX_SLOTS_PER_BOOKING = 10;

/**
 * Lock several slots for one checkout, all-or-nothing.
 *
 * There's no multi-document transaction here — lockSlot's atomic
 * findOneAndUpdate already makes each individual lock race-safe, and a
 * strict DB transaction would additionally require the deployment's MongoDB
 * to run as a replica set, which isn't guaranteed for every environment this
 * runs in (e.g. a standalone local dev instance). Instead: lock slots one at
 * a time, and if any fails partway through, release everything already
 * locked by this same request before surfacing the error — so a failed
 * multi-slot request never leaves some slots silently locked out from under
 * other customers.
 */
export const lockMultipleSlots = async (userId, slotIds) => {
  const lockedSlots = [];
  try {
    for (const slotId of slotIds) {
      const locked = await lockSlot(userId, slotId);
      lockedSlots.push(locked);
    }
  } catch (err) {
    await Promise.all(
      lockedSlots.map((s) =>
        Slot.findOneAndUpdate(
          { _id: s._id, status: "LOCKED", lockedBy: userId },
          { status: "AVAILABLE", lockedBy: null, lockExpiresAt: null, lockedPrice: null }
        )
      )
    );
    throw err;
  }
  return lockedSlots;
};

/**
 * Confirm several already-locked slots as one booking group. Same
 * compensating-rollback approach as lockMultipleSlots — if a confirm fails
 * partway (shouldn't happen since we hold the locks ourselves, but a lock
 * can still expire under a very slow request), cancel whatever bookings
 * already succeeded rather than leaving a partial group.
 */
const confirmMultipleSlots = async (userId, slotIds, groupId) => {
  const bookings = [];
  try {
    for (const slotId of slotIds) {
      const booking = await confirmSlot(userId, slotId, groupId);
      bookings.push(booking);
    }
  } catch (err) {
    await Promise.all(bookings.map((b) => cancelBooking(userId, b._id).catch(() => {})));
    throw err;
  }
  return bookings;
};

/**
 * Book multiple slots in one checkout (all-or-nothing). Each slot still
 * becomes its own Booking document — they just share a groupId.
 */
/**
 * Shared selection validation for any multi-slot checkout path (instant
 * simulated booking, and — once payment exists — the pay-then-confirm flow
 * in the payment module). Does not lock anything; only checks that the
 * requested slots are a legal one-venue, back-to-back selection.
 */
export const validateSlotSelection = async (slotIds) => {
  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    throw new ApiError(400, "At least one slot must be selected");
  }
  const uniqueIds = [...new Set(slotIds.map(String))];
  if (uniqueIds.length > MAX_SLOTS_PER_BOOKING) {
    throw new ApiError(400, `You can book at most ${MAX_SLOTS_PER_BOOKING} slots at a time`);
  }

  // One checkout = one venue. The frontend keeps slot selection in a global
  // context that isn't reset when the customer switches turfs, so a mixed-turf
  // slotIds array is reachable in practice — and it would charge for, and book,
  // a venue other than the one shown on the confirmation screen.
  const slotDocs = await Slot.find({ _id: { $in: uniqueIds } }).select("turfId startTime endTime price").lean();
  if (slotDocs.length !== uniqueIds.length) {
    throw new ApiError(404, "One or more slots no longer exist");
  }
  const turfIds = new Set(slotDocs.map((s) => s.turfId.toString()));
  if (turfIds.size > 1) {
    throw new ApiError(400, "All slots in one booking must belong to the same turf");
  }

  // A "duration" booking (e.g. 11:30 for 1.5h) only makes sense as one
  // uninterrupted block of court time — this rejects a selection with a gap
  // or overlap between slots before anything gets locked.
  const sortedByStart = [...slotDocs].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < sortedByStart.length; i++) {
    if (sortedByStart[i].startTime.getTime() !== sortedByStart[i - 1].endTime.getTime()) {
      throw new ApiError(400, "Slots in one booking must be back-to-back with no gaps or overlaps");
    }
  }

  return { uniqueIds, turfId: sortedByStart[0].turfId, slotDocs: sortedByStart };
};

export const bookMultipleSlots = async (userId, slotIds) => {
  const { uniqueIds } = await validateSlotSelection(slotIds);
  await lockMultipleSlots(userId, uniqueIds);
  const groupId = randomUUID();
  return confirmMultipleSlots(userId, uniqueIds, groupId);
};

/**
 * Lock several slots for checkout without confirming them — the first half
 * of the pay-then-confirm flow. Used by the payment module: it locks the
 * slots, then a Razorpay order is created against them, and only a verified
 * payment calls confirmSlot/confirmMultipleSlots to actually create the
 * Booking documents.
 */
export const lockSlotsForCheckout = async (userId, slotIds) => {
  const { uniqueIds, turfId } = await validateSlotSelection(slotIds);
  const lockedSlots = await lockMultipleSlots(userId, uniqueIds);
  return { slotIds: uniqueIds, turfId, lockedSlots };
};

/**
 * Explicit release of a checkout hold — called when the customer backs out
 * of payment (closed the Razorpay popup, hit back, closed the tab) instead
 * of letting the lock/reservation sit until its TTL expires on its own.
 * Only releases slots still LOCKED by this same user; anything already
 * confirmed, expired, or re-locked by someone else is left untouched, so
 * this can never be used to knock loose another customer's hold or a real
 * booking.
 */
export const releaseCheckoutHold = async (userId, slotIds) => {
  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    throw new ApiError(400, "At least one slot must be specified");
  }
  await Slot.updateMany(
    { _id: { $in: slotIds }, status: "LOCKED", lockedBy: userId },
    { status: "AVAILABLE", lockedBy: null, lockExpiresAt: null, lockedPrice: null }
  );
};

/**
 * System-triggered rollback of a booking that should never have existed —
 * used only when a payment was captured but the slot could not be atomically
 * claimed (lock expired / stolen by another checkout in the race window
 * between payment success and our own confirmation transaction). Unlike
 * cancelBooking, this bypasses the cutoff/started checks: those exist to stop
 * a *customer* backing out of a slot they're holding, not to block the system
 * from undoing a booking that should never have been created in the first
 * place.
 */
export const forceCancelForSystem = async (bookingId, reason) => {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === "CANCELLED") return booking;
  booking.status = "CANCELLED";
  booking.cancelledBy = "SYSTEM";
  booking.notes = reason;
  await booking.save();
  await Slot.findByIdAndUpdate(booking.slotId, {
    status: "AVAILABLE",
    bookingId: null,
    lockedBy: null,
    lockExpiresAt: null,
    lockedPrice: null,
  });
  return booking;
};

/**
 * Get all bookings for the logged-in user.
 */
export const getUserBookings = async (userId) => {
  const bookings = await Booking.find({ userId })
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime price")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt")
    .sort({ createdAt: -1 });
  return bookings;
};

// A booking can only be cancelled up to this long before its slot starts.
// Keeps a customer from cancelling minutes before play — which both denies
// the owner any chance to resell the slot and, once real payment exists,
// would otherwise force a full refund for time the venue held open for them.
const CANCELLATION_CUTOFF_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Cancel a booking.
 * Only the user who made the booking can cancel it.
 */
export const cancelBooking = async (userId, bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  if (booking.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "You can only cancel your own bookings");
  }
  if (booking.status === "CANCELLED") {
    throw new ApiError(400, "Booking is already cancelled");
  }

  // A slot that has already started can no longer be given up: releasing it
  // back to AVAILABLE would advertise a time that is partly or wholly in the
  // past as bookable, and it would imply a refund for court time the customer
  // already held. The UI hides Cancel on past bookings; this is the rule that
  // actually enforces it.
  const slot = await Slot.findById(booking.slotId).select("startTime").lean();
  if (slot && slot.startTime <= new Date()) {
    throw new ApiError(400, "This slot has already started and can no longer be cancelled");
  }
  if (slot && slot.startTime.getTime() - Date.now() < CANCELLATION_CUTOFF_MS) {
    throw new ApiError(
      400,
      "Bookings can only be cancelled up to 6 hours before the slot starts"
    );
  }

  // Update booking status
  booking.status = "CANCELLED";
  booking.cancelledBy = "CUSTOMER";
  await booking.save();

  // Release the slot back to AVAILABLE (clear all lock/booking state)
  await Slot.findByIdAndUpdate(booking.slotId, {
    status: "AVAILABLE",
    bookingId: null,
    lockedBy: null,
    lockExpiresAt: null,
    lockedPrice: null,
  });

  return booking;
};

/**
 * Cancel a booking as the owner of the turf it belongs to (or an admin).
 * Unlike the customer path, there is no cutoff/started check — an owner
 * needs to be able to cancel right up to and past the start time (e.g. a
 * maintenance emergency, a no-show they're voiding).
 */
export const cancelBookingAsOwner = async (actor, bookingId, reason) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  await assertCanManageBooking(actor, booking.turfId);
  if (booking.status === "CANCELLED") {
    throw new ApiError(400, "Booking is already cancelled");
  }

  booking.status = "CANCELLED";
  booking.cancelledBy = actor.role === "ADMIN" ? "ADMIN" : "OWNER";
  if (reason) booking.notes = reason;
  await booking.save();

  await Slot.findByIdAndUpdate(booking.slotId, {
    status: "AVAILABLE",
    bookingId: null,
    lockedBy: null,
    lockExpiresAt: null,
    lockedPrice: null,
  });

  if (actor.role === "ADMIN") {
    await logAdminAction(actor._id, "BOOKING_CANCELLED", "BOOKING", booking._id, { reason: reason || undefined });
  }

  return booking;
};

/**
 * Mark a cancelled booking as refunded — the owner's own bookkeeping note
 * that they handed the money back outside the app (cash, UPI, etc). No
 * payment gateway exists, so this never moves real money; it only exists so
 * an owner has somewhere to record that they did.
 */
export const markBookingRefunded = async (actor, bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  await assertCanManageBooking(actor, booking.turfId);
  if (booking.status !== "CANCELLED") {
    throw new ApiError(400, "Only a cancelled booking can be marked as refunded");
  }
  if (booking.paymentId) {
    // A real Razorpay refund is auto-initiated on cancellation for any
    // ONLINE booking (see payment.service.js initiateRefundForBooking,
    // invoked from booking.controller.js's afterCancellation) — this manual
    // bookkeeping note exists only for CASH/PENDING bookings with no real
    // payment record, so it must never be used to paper over a real refund's
    // actual state.
    throw new ApiError(400, "This booking was paid online — its refund status is tracked automatically");
  }
  if (booking.refundStatus === "MARKED_REFUNDED") {
    throw new ApiError(400, "Booking is already marked as refunded");
  }

  booking.refundStatus = "MARKED_REFUNDED";
  await booking.save();

  if (actor.role === "ADMIN") {
    await logAdminAction(actor._id, "BOOKING_REFUNDED", "BOOKING", booking._id);
  }

  return booking;
};

/**
 * Create a booking on a customer's behalf (phone/walk-in) from the owner
 * panel. Reuses bookMultipleSlots unchanged for the actual locking/pricing/
 * contiguity logic — a manual booking is not a different booking mechanism,
 * just a different caller identity (the owner, booking for someone else).
 */
export const createManualBooking = async (ownerId, { turfId, customerId, slotIds, paymentMethod, notes }) => {
  if (!turfId || !customerId) {
    throw new ApiError(400, "A turf and a customer are required");
  }
  if (!mongoose.isValidObjectId(customerId)) {
    throw new ApiError(400, "Invalid customer");
  }
  await assertOwnsBookingTurf(ownerId, turfId);

  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    throw new ApiError(400, "At least one slot must be selected");
  }
  const slotDocs = await Slot.find({ _id: { $in: slotIds } }).select("turfId").lean();
  if (
    slotDocs.length !== slotIds.length ||
    slotDocs.some((s) => s.turfId.toString() !== turfId.toString())
  ) {
    throw new ApiError(400, "All selected slots must belong to the chosen turf");
  }

  // lockSlot's atomic update uses the aggregation-pipeline update form (so it
  // can set lockedPrice from the slot's own current price in the same op) —
  // pipeline updates skip Mongoose's normal schema casting on $set values, so
  // a plain string here would get written into the ObjectId `lockedBy` field
  // as a raw string. confirmSlot's later plain-object query casts its filter
  // value to ObjectId as usual, so it would never match that stored string
  // and every manual booking would fail at the confirm step with the slot
  // left stuck LOCKED. Every other caller passes req.user._id, already a
  // real ObjectId from the authenticated user document — this is the one
  // path handing lockSlot a plain string, so it's the one that has to cast.
  const customerObjectId = new mongoose.Types.ObjectId(customerId);

  const bookings = await bookMultipleSlots(customerObjectId, slotIds);
  const bookingIds = bookings.map((b) => b._id);

  await Booking.updateMany(
    { _id: { $in: bookingIds } },
    {
      createdBy: "OWNER",
      paymentMethod: paymentMethod ?? "CASH",
      notes: notes ?? null,
    }
  );

  return Booking.find({ _id: { $in: bookingIds } })
    .populate("userId", "name email phone")
    .populate("slotId", "startTime endTime price")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt");
};

/**
 * Get bookings for a specific turf (owner view).
 *
 * `ownerId` is required and verified against the turf: authenticating as
 * *some* owner is not enough to read another owner's customer list. This
 * response includes customer name/email/phone, so without the ownership
 * check any owner could enumerate turf ids and harvest the whole platform's
 * customer PII.
 */
export const getBookingsByTurf = async (ownerId, turfId, { page = 1, limit = 20 } = {}) => {
  await assertOwnsBookingTurf(ownerId, turfId);

  const query = { turfId, status: "CONFIRMED" };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Booking.find(query)
      .populate("userId", "name email phone")
      .populate("slotId", "startTime endTime price")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Get all bookings for an owner (all their turfs), with optional filters —
 * date range, turf, status — and pagination. Established as the one
 * pagination pattern in this backend: { items, total, page, pages }.
 */
export const getOwnerBookings = async (ownerId, { page = 1, limit = 20, from, to, turfId, status, paymentStatus, refundStatus } = {}) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);

  const query = { turfId: { $in: turfIds } };
  if (turfId) {
    if (!turfIds.some((id) => id.toString() === turfId)) {
      throw new ApiError(403, "You do not own this turf");
    }
    query.turfId = turfId;
  }
  if (status) query.status = status;
  if (refundStatus) query.refundStatus = refundStatus;
  if (paymentStatus) {
    const paymentIds = await Payment.find({ status: paymentStatus }).select("_id");
    query.paymentId = { $in: paymentIds.map((p) => p._id) };
  }
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Booking.find(query)
      .populate("userId", "name email phone")
      .populate("turfId", "name location sportsType")
      .populate("slotId", "startTime endTime price")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Aggregated customer list for an owner — one row per customer who has ever
 * booked at one of their turfs, with booking counts and lifetime spend.
 * There is no separate Customer collection; this is entirely derived from
 * Booking + User, so it can never drift out of sync with the bookings
 * themselves.
 */
export const getOwnerCustomers = async (ownerId, { page = 1, limit = 20 } = {}) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);
  const skip = (page - 1) * limit;

  const basePipeline = [
    { $match: { turfId: { $in: turfIds } } },
    {
      $group: {
        _id: "$userId",
        totalBookings: { $sum: 1 },
        confirmedCount: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
        totalSpent: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$amount", 0] } },
        lastBookingAt: { $max: "$createdAt" },
      },
    },
    { $sort: { lastBookingAt: -1 } },
  ];

  const [countResult] = await Booking.aggregate([...basePipeline, { $count: "total" }]);
  const total = countResult?.total ?? 0;

  const items = await Booking.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        email: "$user.email",
        phone: "$user.phone",
        isGuest: "$user.isGuest",
        totalBookings: 1,
        confirmedCount: 1,
        cancelledCount: 1,
        totalSpent: 1,
        lastBookingAt: 1,
      },
    },
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * One customer's full detail for an owner — stats plus every booking they've
 * made at this owner's turfs. 404s rather than returning an empty result if
 * the customer has never booked here, so this can't be used to probe whether
 * an arbitrary userId exists on the platform.
 */
export const getOwnerCustomerDetail = async (ownerId, customerId) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);

  const bookings = await Booking.find({ turfId: { $in: turfIds }, userId: customerId })
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime price")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt")
    .sort({ createdAt: -1 });

  if (bookings.length === 0) {
    throw new ApiError(404, "No bookings found for this customer at your turfs");
  }

  const customer = await User.findById(customerId).select("name email phone isGuest");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const stats = {
    totalBookings: bookings.length,
    confirmedCount: confirmed.length,
    cancelledCount: bookings.length - confirmed.length,
    totalSpent: confirmed.reduce((sum, b) => sum + b.amount, 0),
  };

  return { customer, stats, bookings };
};
