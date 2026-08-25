import { randomUUID } from "crypto";
import mongoose from "mongoose";
import Slot from "../slot/slot.model.js";
import Booking, { HONOURED_STATUSES, IS_HONOURED_EXPR } from "./booking.model.js";
import Turf from "../turf/turf.model.js";
import User from "../user/user.model.js";
import Payment from "../payment/payment.model.js";
import Payout from "../payout/payout.model.js";
import { isTurfBookable } from "../turf/turf.service.js";
import { logAdminAction } from "../admin/admin.service.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { toRupees } from "../../common/utils/money.js";
import { istRangeFilter, istDateKey, istDayBounds, previousDateKey, IST_TIMEZONE } from "../../common/utils/istTime.js";
import { buildPaginatedResult } from "../../common/utils/pagination.js";

const log = logger.child({ module: "booking.service" });

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

// Short hold applied the moment a customer lands on the booking summary
// screen, before they've committed to paying — just long enough to stop a
// second customer from grabbing the same slot while the first is reading the
// summary. lockSlot's same-user renewal branch lets this be extended to the
// full LOCK_TTL_MS the moment they actually proceed to payment.
const SUMMARY_LOCK_TTL_MS = 60 * 1000; // 1 minute

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
export const lockSlot = async (userId, slotId, ttlMs = LOCK_TTL_MS) => {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + ttlMs);
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
      // The third branch lets a customer who already holds this slot renew
      // or extend their own hold (e.g. summary's 1-minute hold stepping up to
      // the full 5-minute payment hold) without waiting for it to expire
      // first — it can never hand the slot to anyone but its current holder.
      $or: [
        { status: "AVAILABLE" },
        { status: "LOCKED", lockExpiresAt: { $lt: now } },
        { status: "LOCKED", lockedBy: userId },
      ],
    },
    [
      {
        $set: {
          status: "LOCKED",
          lockedBy: userId,
          lockExpiresAt,
          lockedPricePaise: "$pricePaise",
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
      lockedPricePaise: null,
    }
  );

  if (!slotBeforeConfirm) {
    throw new ApiError(409, "Slot lock expired or was not locked by you");
  }

  // Charge the price snapshotted at lock time, not whatever `price` is now —
  // closes the window where an owner's price change during the 5-minute hold
  // would change what the customer actually pays.
  const chargedAmountPaise = slotBeforeConfirm.lockedPricePaise ?? slotBeforeConfirm.pricePaise;

  // Both price fields missing means the slot document predates (or postdates)
  // the paise migration relative to this code — the money fields it actually
  // carries aren't the ones being read here. Caught explicitly because the
  // alternative is `amountPaise: undefined` reaching Booking.create and
  // surfacing as a generic "Booking amount is required" ValidationError,
  // which says nothing about the schema mismatch that really caused it. The
  // slot is already flipped to BOOKED at this point, so this throw is what
  // finalizePaymentSuccess's rollback/refund path keys off.
  if (typeof chargedAmountPaise !== "number" || !Number.isFinite(chargedAmountPaise)) {
    log.error("Slot has no usable price — cannot price the booking", {
      slotId: String(slotId),
      userId: String(userId),
      lockedPricePaise: slotBeforeConfirm.lockedPricePaise,
      pricePaise: slotBeforeConfirm.pricePaise,
      slotFields: Object.keys(slotBeforeConfirm.toObject({ transform: false })),
    });
    throw new ApiError(500, "Slot is missing price data — booking cannot be priced");
  }

  // Create the booking record. slotStartTime/slotEndTime are copied from the
  // slot here — this is the one place a Booking is ever created, so it's the
  // one place that has to keep them in step (see booking.model.js).
  const booking = await Booking.create({
    userId,
    turfId: slotBeforeConfirm.turfId,
    slotId: slotBeforeConfirm._id,
    slotStartTime: slotBeforeConfirm.startTime,
    slotEndTime: slotBeforeConfirm.endTime,
    status: "CONFIRMED",
    amountPaise: chargedAmountPaise,
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
export const lockMultipleSlots = async (userId, slotIds, ttlMs = LOCK_TTL_MS) => {
  const lockedSlots = [];
  try {
    for (const slotId of slotIds) {
      const locked = await lockSlot(userId, slotId, ttlMs);
      lockedSlots.push(locked);
    }
  } catch (err) {
    await Promise.all(
      lockedSlots.map((s) =>
        Slot.findOneAndUpdate(
          { _id: s._id, status: "LOCKED", lockedBy: userId },
          { status: "AVAILABLE", lockedBy: null, lockExpiresAt: null, lockedPricePaise: null }
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
  const slotDocs = await Slot.find({ _id: { $in: uniqueIds } }).select("turfId startTime endTime pricePaise").lean();
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
 * Short 1-minute hold applied the moment a customer opens the booking
 * summary screen — before they've committed to paying. Reuses lockSlot's
 * same-user renewal branch so a customer who proceeds to "Pay Now" within
 * that minute has their hold extended (not re-raced) to the full payment
 * TTL by the subsequent lockSlotsForCheckout call, instead of having to win
 * the slot back from scratch.
 */
export const holdSlotsForSummary = async (userId, slotIds) => {
  const { uniqueIds, turfId } = await validateSlotSelection(slotIds);
  const lockedSlots = await lockMultipleSlots(userId, uniqueIds, SUMMARY_LOCK_TTL_MS);
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
    { status: "AVAILABLE", lockedBy: null, lockExpiresAt: null, lockedPricePaise: null }
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
    lockedPricePaise: null,
  });
  return booking;
};

/**
 * Collapses per-hour Booking documents that were created as one multi-slot
 * checkout (linked by a shared `groupId`) into a single logical reservation
 * spanning startTime..endTime, for every list/detail view that shows
 * bookings to a user/owner/admin. Bookings without a groupId (or whose
 * groupId siblings were cancelled independently, leaving mixed statuses)
 * are grouped by `${groupId||_id}:${status}` so a partial cancellation never
 * gets silently merged with the bookings that are still active.
 *
 * Still runs in JS, but only ever over ONE PAGE of bookings — `pageOfReservations`
 * below resolves which reservations belong on the page with a Mongo $group
 * first, then fetches just those. Doing the merge here keeps the populated
 * refs (turfId/userId/slotId/paymentId) that an all-aggregation version would
 * have to re-derive via $lookup, without the unbounded fetch it used to need.
 *
 * Ordered by play time, newest first — `startTime`, not `createdAt`. These
 * lists answer "what's on the schedule", so the booking's own creation time is
 * the wrong axis; sorting by it is what made the owner's list read as a
 * chronicle of when people happened to book rather than of when they play.
 */
const groupBookingsByReservation = (bookings) => {
  const groups = new Map();
  for (const booking of bookings) {
    const key = `${booking.groupId || booking._id}:${booking.status}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }

  const result = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const aStart = a.slotId?.startTime ?? a.createdAt;
      const bStart = b.slotId?.startTime ?? b.createdAt;
      return new Date(aStart) - new Date(bStart);
    });
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    result.push({
      _id: first._id,
      groupId: first.groupId || null,
      bookingIds: sorted.map((b) => b._id),
      bookings: sorted,
      status: first.status,
      startTime: first.slotId?.startTime ?? null,
      endTime: last.slotId?.endTime ?? null,
      amount: toRupees(sorted.reduce((sum, b) => sum + (b.amountPaise || 0), 0)),
      turfId: first.turfId,
      userId: first.userId,
      paymentId: first.paymentId,
      createdAt: first.createdAt,
      cancelledBy: first.cancelledBy,
      refundStatus: first.refundStatus,
      // Carried through because the customer-facing cancellation flow has to
      // tell someone whether cancelling refunds real money or not, and that
      // answer is ONLINE-vs-CASH. Omitting it here made every grouped
      // reservation look like it had no payment method at all, which is how
      // the cancel dialog ended up telling paying customers they were never
      // charged.
      paymentMethod: first.paymentMethod,
      payoutStatus: first.payoutStatus,
      notes: first.notes,
    });
  }

  result.sort((a, b) => {
    const aStart = a.startTime ?? a.createdAt;
    const bStart = b.startTime ?? b.createdAt;
    return new Date(bStart) - new Date(aStart);
  });
  return result;
};

// The populated refs every booking list returns. Kept in one place because
// four call sites repeat it and a field missing from one of them shows up as
// a silently blank column rather than an error.
const withBookingRefs = (query) =>
  query
    .populate("userId", "name email phone")
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime pricePaise")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amountPaise currency refunds failureReason paidAt");

/**
 * One reservation = every Booking document sharing a groupId *and* a status
 * (see groupBookingsByReservation). Pagination has to count and slice those
 * reservations, not the underlying per-slot Booking documents, or page sizes
 * come out wrong the moment anyone books more than one slot.
 *
 * This previously couldn't be done in Mongo, so the code fetched a capped 500
 * bookings and sliced the grouped array in JS. That cap was a silent data-loss
 * bug: past it, older reservations simply stopped existing as far as every
 * caller was concerned — history pages went blank and the owner dashboard's
 * lifetime revenue quietly stopped growing while still being displayed as fact.
 *
 * The fix is two round trips instead of one. First $group the matching
 * bookings into reservations and page over *those* server-side — cheap, since
 * it projects almost nothing. Then fetch and populate only the bookings on
 * that page. Cost is now bounded by page size rather than by lifetime history,
 * with no cap and nothing dropped.
 */
const pageOfReservations = async (query, { page = 1, limit = 20 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const [faceted] = await Booking.aggregate([
    { $match: query },
    {
      $group: {
        // Mirrors the JS key exactly: a groupId if there is one, otherwise the
        // booking's own id, and always split by status so a partially
        // cancelled group doesn't merge with its still-active siblings.
        _id: {
          key: { $ifNull: ["$groupId", { $toString: "$_id" }] },
          status: "$status",
        },
        bookingIds: { $push: "$_id" },
        startTime: { $min: "$slotStartTime" },
      },
    },
    // Play time, newest first. `_id` breaks ties so paging is stable — without
    // it, two reservations starting at the same instant can swap places
    // between requests and a booking shows twice or not at all.
    { $sort: { startTime: -1, "_id.key": 1 } },
    {
      $facet: {
        total: [{ $count: "n" }],
        page: [{ $skip: skip }, { $limit: safeLimit }],
      },
    },
  ]);

  const total = faceted?.total?.[0]?.n ?? 0;
  const idsOnPage = (faceted?.page ?? []).flatMap((g) => g.bookingIds);

  const bookings = idsOnPage.length
    ? await withBookingRefs(Booking.find({ _id: { $in: idsOnPage } }))
    : [];

  return {
    items: groupBookingsByReservation(bookings),
    total,
    page: safePage,
    pages: Math.ceil(total / safeLimit) || 1,
  };
};

/**
 * Moves finished bookings CONFIRMED → COMPLETED.
 *
 * Deliberately lazy and scoped, in the same spirit as `releaseExpiredLocks`:
 * this codebase has no scheduler, and a booking's completion doesn't need one.
 * Reading a booking list is what settles the bookings in it, and the answer is
 * correct whether or not anything has swept the collection — `slotEndTime` is
 * the source of truth, the status is a materialised view of it.
 *
 * NO_SHOW is never set here. The system can tell that a slot has passed; it
 * cannot tell whether anyone turned up, so that transition only ever happens
 * because a human said so.
 */
export const settleFinishedBookings = async (query = {}) => {
  const result = await Booking.updateMany(
    { ...query, status: "CONFIRMED", slotEndTime: { $lte: new Date() } },
    { $set: { status: "COMPLETED" } }
  );
  return result.modifiedCount;
};

/**
 * Owner/admin marks a booking as a no-show. Only meaningful once the slot has
 * actually passed — before that the customer hasn't failed to turn up, they
 * just haven't turned up *yet*.
 *
 * Distinct from cancellation in the way that matters: a cancellation refunds
 * and frees the slot, a no-show keeps the money and leaves the slot consumed.
 */
export const markBookingNoShow = async (actor, bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  await assertCanManageBooking(actor, booking.turfId);

  if (booking.status === "CANCELLED") {
    throw new ApiError(400, "A cancelled booking cannot be marked as a no-show");
  }
  if (booking.status === "NO_SHOW") {
    throw new ApiError(400, "Booking is already marked as a no-show");
  }
  if (booking.slotEndTime > new Date()) {
    throw new ApiError(400, "This booking hasn't finished yet — you can only mark a no-show after the slot has passed");
  }

  booking.status = "NO_SHOW";
  await booking.save();

  if (actor.role === "ADMIN") {
    await logAdminAction(actor._id, "BOOKING_NO_SHOW", "BOOKING", booking._id);
  }

  return booking;
};

/**
 * Turns a `from`/`to` pair into a filter on when the booking is *played*.
 *
 * Two bugs lived here. The range was applied to `createdAt`, so an owner
 * asking for today got the bookings *placed* today — next month's advance
 * bookings included, this afternoon's actual schedule excluded, which is the
 * opposite of what the filter is for. And the bounds were parsed with a bare
 * `new Date("YYYY-MM-DD")`, which resolves to UTC midnight: on an IST platform
 * that starts the day 5½ hours late and ends it 5½ hours early, so early-
 * morning and late-evening slots fell out of their own day.
 *
 * A plain ISO timestamp (rather than a date-only key) is passed straight
 * through, so a caller that genuinely wants an instant still can.
 */
export const playTimeRangeFilter = (from, to) => {
  const range = istRangeFilter(from, to);
  return range ? { slotStartTime: range } : {};
};

/**
 * Get all bookings for the logged-in user.
 *
 * Returns a plain array rather than a page: the dashboard splits these into
 * Upcoming/Completed/Cancelled tabs client-side, so it needs the whole set.
 * Ordered by play time descending, which also makes the guard below benign —
 * if a customer ever did exceed it, what falls off the end is their most
 * ancient history, never an upcoming booking.
 */
const MAX_USER_BOOKINGS = 500;

export const getUserBookings = async (userId) => {
  // Settle first, so the list reflects reality rather than whatever the
  // statuses last happened to be written as.
  await settleFinishedBookings({ userId });
  const bookings = await withBookingRefs(Booking.find({ userId }))
    .sort({ slotStartTime: -1 })
    .limit(MAX_USER_BOOKINGS);
  return groupBookingsByReservation(bookings);
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
    lockedPricePaise: null,
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
    lockedPricePaise: null,
  });

  if (actor.role === "ADMIN") {
    await logAdminAction(actor._id, "BOOKING_CANCELLED", "BOOKING", booking._id, { reason: reason || undefined });
  }

  return booking;
};

/**
 * Admin-only: settle one booking's owed-to-owner share outside the app (UPI/
 * bank transfer) and record it. Creates a Payout document covering just this
 * one booking and flips the booking's payoutStatus PENDING → PAID.
 *
 * Restricted to bookings still PENDING — VOID/CLAWBACK_OWED/NONE/already-PAID
 * are all refused, since none of those represent a real amount currently
 * owed to the owner. Owners never call this themselves (they'd have every
 * incentive to mark their own payouts paid without actually being paid).
 */
export const markBookingPaidOut = async (adminId, bookingId, { method, note }) => {
  if (!["UPI", "BANK_TRANSFER", "OTHER"].includes(method)) {
    throw new ApiError(400, "Payout method must be UPI, BANK_TRANSFER, or OTHER");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }
  if (booking.payoutStatus !== "PENDING") {
    throw new ApiError(400, `This booking has no pending payout to settle (status: ${booking.payoutStatus})`);
  }

  const turf = await Turf.findById(booking.turfId).select("ownerId");
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }

  const payout = await Payout.create({
    ownerId: turf.ownerId,
    bookingIds: [booking._id],
    amountPaise: booking.ownerAmountPaise,
    method,
    note: note || null,
    paidBy: adminId,
  });

  // Atomic claim mirrors the rest of this file's payment-state transitions —
  // refuses to double-settle a booking that raced to PAID (or was refunded)
  // between the read above and this write.
  const settled = await Booking.findOneAndUpdate(
    { _id: booking._id, payoutStatus: "PENDING" },
    { payoutStatus: "PAID", payoutId: payout._id, paidOutAt: new Date() },
    { new: true }
  );
  if (!settled) {
    await Payout.findByIdAndDelete(payout._id);
    throw new ApiError(409, "This booking's payout was already settled or changed — please refresh");
  }

  await logAdminAction(adminId, "BOOKING_PAID_OUT", "BOOKING", booking._id, {
    amountPaise: payout.amountPaise,
    method,
    ownerId: String(turf.ownerId),
  });

  return settled;
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
    .populate("slotId", "startTime endTime pricePaise")
    .populate("paymentId", "status razorpayOrderId razorpayPaymentId amountPaise currency refunds failureReason paidAt");
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
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Resolves a free-text `search` term into a `$or` clause matching either the
 * customer's name/email or the turf's name, scoped to the turf ids already in
 * play — so search combines with pagination server-side instead of the
 * frontend filtering only whatever page happened to be loaded.
 */
const searchOrClause = async (search, scopedTurfIds) => {
  if (!search) return null;
  const regex = new RegExp(escapeRegex(search), "i");
  const [matchedUsers, matchedTurfs] = await Promise.all([
    User.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
    Turf.find({ _id: { $in: scopedTurfIds }, name: regex }).select("_id"),
  ]);
  return {
    $or: [
      { userId: { $in: matchedUsers.map((u) => u._id) } },
      { turfId: { $in: matchedTurfs.map((t) => t._id) } },
    ],
  };
};

export const getBookingsByTurf = async (ownerId, turfId, { page = 1, limit = 20, status, search } = {}) => {
  const turf = await assertOwnsBookingTurf(ownerId, turfId);

  // `status` used to be hardcoded to CONFIRMED here, so this view silently
  // disagreed with the all-turfs list about the same bookings — a cancellation
  // visible on one screen was simply absent from the other, with nothing to
  // indicate it was being filtered. Now it's an optional filter like everywhere
  // else, and the default is "everything".
  await settleFinishedBookings({ turfId: turf._id });

  const query = { turfId: turf._id };
  if (status) query.status = status;
  const orClause = await searchOrClause(search, [turf._id]);
  if (orClause) Object.assign(query, orClause);

  return pageOfReservations(query, { page, limit });
};

/**
 * Get all bookings for an owner (all their turfs), with optional filters —
 * date range, turf, status — and pagination. Established as the one
 * pagination pattern in this backend: { items, total, page, pages }.
 */
export const getOwnerBookings = async (ownerId, { page = 1, limit = 20, from, to, turfId, status, paymentStatus, refundStatus, payoutStatus, search } = {}) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);
  await settleFinishedBookings({ turfId: { $in: turfIds } });

  const query = { turfId: { $in: turfIds } };
  let scopedTurfIds = turfIds;
  if (turfId) {
    if (!turfIds.some((id) => id.toString() === turfId)) {
      throw new ApiError(403, "You do not own this turf");
    }
    query.turfId = turfId;
    scopedTurfIds = [turfId];
  }
  if (status) query.status = status;
  if (refundStatus) query.refundStatus = refundStatus;
  if (payoutStatus) query.payoutStatus = payoutStatus;
  if (paymentStatus) {
    const paymentIds = await Payment.find({ status: paymentStatus }).select("_id");
    query.paymentId = { $in: paymentIds.map((p) => p._id) };
  }
  Object.assign(query, playTimeRangeFilter(from, to));
  const orClause = await searchOrClause(search, scopedTurfIds);
  if (orClause) Object.assign(query, orClause);

  return pageOfReservations(query, { page, limit });
};

// What the owner actually earns from one booking: their share after the
// platform's commission for ONLINE bookings, and the whole amount for
// CASH/PENDING ones (the platform never held that money). Bookings confirmed
// before the commission split existed have no ownerAmountPaise and are treated
// as pre-commission, same as cash.
const OWNER_EARNINGS_EXPR = {
  $cond: [
    { $and: [{ $eq: ["$paymentMethod", "ONLINE"] }, { $ne: ["$ownerAmountPaise", null] }] },
    "$ownerAmountPaise",
    "$amountPaise",
  ],
};

const REVENUE_SERIES_DAYS = 7;

/**
 * Headline numbers for the owner dashboard, aggregated in Mongo.
 *
 * These used to be derived in the browser by reducing over whatever bookings
 * the list endpoint happened to return (`/bookings/owner?limit=500`), which
 * made the dashboard's "Your Earnings" figure a function of the page size
 * rather than of the bookings: past 500 lifetime bookings it silently stopped
 * growing while still being presented as a lifetime total. Revenue has to be
 * computed over all matching rows, server-side, or it isn't revenue.
 */
export const getOwnerStats = async (ownerId) => {
  const turfs = await Turf.find({ ownerId }).select("_id isActive");
  const turfIds = turfs.map((t) => t._id);
  await settleFinishedBookings({ turfId: { $in: turfIds } });
  const now = new Date();

  const seriesKeys = [];
  let cursor = istDateKey(now);
  for (let i = 0; i < REVENUE_SERIES_DAYS; i++) {
    seriesKeys.unshift(cursor);
    cursor = previousDateKey(cursor);
  }
  const seriesStart = istDayBounds(seriesKeys[0]).start;

  const [totals, upcoming, todayAgg, seriesRaw] = await Promise.all([
    Booking.aggregate([
      { $match: { turfId: { $in: turfIds } } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          confirmedCount: { $sum: { $cond: [IS_HONOURED_EXPR, 1, 0] } },
          earningsPaise: {
            $sum: { $cond: [IS_HONOURED_EXPR, OWNER_EARNINGS_EXPR, 0] },
          },
        },
      },
    ]),
    Booking.countDocuments({
      turfId: { $in: turfIds },
      status: "CONFIRMED",
      slotStartTime: { $gte: now },
    }),
    // "Today" is the IST calendar day, and it's keyed off when the booking is
    // played — an owner asking what today has taken means the day's sessions,
    // not the payments that happened to be made today.
    Booking.aggregate([
      {
        $match: {
          turfId: { $in: turfIds },
          status: { $in: HONOURED_STATUSES },
          slotStartTime: { $gte: istDayBounds(istDateKey(now)).start, $lte: istDayBounds(istDateKey(now)).end },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, earningsPaise: { $sum: OWNER_EARNINGS_EXPR } } },
    ]),
    Booking.aggregate([
      { $match: { turfId: { $in: turfIds }, status: { $in: HONOURED_STATUSES }, slotStartTime: { $gte: seriesStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$slotStartTime", timezone: IST_TIMEZONE } },
          earningsPaise: { $sum: OWNER_EARNINGS_EXPR },
        },
      },
    ]),
  ]);

  const byDate = new Map(seriesRaw.map((d) => [d._id, d]));

  return {
    totalBookings: totals[0]?.totalBookings ?? 0,
    confirmedCount: totals[0]?.confirmedCount ?? 0,
    totalEarnings: toRupees(totals[0]?.earningsPaise ?? 0),
    upcomingCount: upcoming,
    todayCount: todayAgg[0]?.count ?? 0,
    todayEarnings: toRupees(todayAgg[0]?.earningsPaise ?? 0),
    activeTurfs: turfs.filter((t) => t.isActive).length,
    totalTurfs: turfs.length,
    dailySeries: seriesKeys.map((key) => ({
      date: key,
      revenue: toRupees(byDate.get(key)?.earningsPaise ?? 0),
    })),
  };
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
        confirmedCount: { $sum: { $cond: [IS_HONOURED_EXPR, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
        totalSpentPaise: { $sum: { $cond: [IS_HONOURED_EXPR, "$amountPaise", 0] } },
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
        totalSpentPaise: 1,
        lastBookingAt: 1,
      },
    },
  ]);

  const itemsWithRupees = items.map(({ totalSpentPaise, ...rest }) => ({
    ...rest,
    totalSpent: toRupees(totalSpentPaise),
  }));

  return { items: itemsWithRupees, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * One customer's full detail for an owner — stats plus every booking they've
 * made at this owner's turfs. 404s rather than returning an empty result if
 * the customer has never booked here, so this can't be used to probe whether
 * an arbitrary userId exists on the platform.
 */
export const getOwnerCustomerDetail = async (ownerId, customerId, { page = 1, limit = 20 } = {}) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);
  const query = { turfId: { $in: turfIds }, userId: customerId };
  const skip = (page - 1) * limit;

  const [bookings, total, statsAgg] = await Promise.all([
    Booking.find(query)
      .populate("turfId", "name location sportsType")
      .populate("slotId", "startTime endTime pricePaise")
      .populate("paymentId", "status razorpayOrderId razorpayPaymentId amountPaise currency refunds failureReason paidAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
    Booking.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          confirmedCount: { $sum: { $cond: [IS_HONOURED_EXPR, 1, 0] } },
          totalSpentPaise: { $sum: { $cond: [IS_HONOURED_EXPR, "$amountPaise", 0] } },
        },
      },
    ]),
  ]);

  if (total === 0) {
    throw new ApiError(404, "No bookings found for this customer at your turfs");
  }

  const customer = await User.findById(customerId).select("name email phone isGuest");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const agg = statsAgg[0] || { totalBookings: 0, confirmedCount: 0, totalSpentPaise: 0 };
  const stats = {
    totalBookings: agg.totalBookings,
    confirmedCount: agg.confirmedCount,
    cancelledCount: agg.totalBookings - agg.confirmedCount,
    totalSpent: toRupees(agg.totalSpentPaise),
  };

  return { customer, stats, ...buildPaginatedResult(bookings, total, page, limit) };
};
