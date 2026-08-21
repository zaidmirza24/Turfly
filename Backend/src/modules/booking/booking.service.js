import { randomUUID } from "crypto";
import Slot from "../slot/slot.model.js";
import Booking from "./booking.model.js";
import Turf from "../turf/turf.model.js";
import { isTurfBookable } from "../turf/turf.service.js";
import ApiError from "../../common/utils/ApiError.js";

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
      // A slot that has already started can't be booked — only present/
      // future slots. Checked atomically here (not as a separate query)
      // so it can't race with the status check below it.
      startTime: { $gt: now },
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
    // Either slot doesn't exist, has already started, or was already LOCKED/BOOKED
    const exists = await Slot.findById(slotId);
    if (!exists) {
      throw new ApiError(404, "Slot not found");
    }
    if (exists.startTime <= now) {
      throw new ApiError(400, "This slot has already started and can no longer be booked");
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
const lockMultipleSlots = async (userId, slotIds) => {
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
export const bookMultipleSlots = async (userId, slotIds) => {
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
  const slotDocs = await Slot.find({ _id: { $in: uniqueIds } }).select("turfId").lean();
  if (slotDocs.length !== uniqueIds.length) {
    throw new ApiError(404, "One or more slots no longer exist");
  }
  const turfIds = new Set(slotDocs.map((s) => s.turfId.toString()));
  if (turfIds.size > 1) {
    throw new ApiError(400, "All slots in one booking must belong to the same turf");
  }

  await lockMultipleSlots(userId, uniqueIds);
  const groupId = randomUUID();
  return confirmMultipleSlots(userId, uniqueIds, groupId);
};

/**
 * Get all bookings for the logged-in user.
 */
export const getUserBookings = async (userId) => {
  const bookings = await Booking.find({ userId })
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime price")
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
 * Get bookings for a specific turf (owner view).
 *
 * `ownerId` is required and verified against the turf: authenticating as
 * *some* owner is not enough to read another owner's customer list. This
 * response includes customer name/email/phone, so without the ownership
 * check any owner could enumerate turf ids and harvest the whole platform's
 * customer PII.
 */
export const getBookingsByTurf = async (ownerId, turfId) => {
  const turf = await Turf.findById(turfId).select("ownerId");
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const bookings = await Booking.find({ turfId, status: "CONFIRMED" })
    .populate("userId", "name email phone")
    .populate("slotId", "startTime endTime price")
    .sort({ createdAt: -1 });
  return bookings;
};

/**
 * Get all bookings for an owner (all their turfs).
 */
export const getOwnerBookings = async (ownerId) => {
  const turfs = await Turf.find({ ownerId });
  const turfIds = turfs.map((t) => t._id);
  return await Booking.find({ turfId: { $in: turfIds } })
    .populate("userId", "name email phone")
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime price")
    .sort({ createdAt: -1 });
};
