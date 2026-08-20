import { randomUUID } from "crypto";
import Slot from "../slot/slot.model.js";
import Booking from "./booking.model.js";
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";

/**
 * Lock expiry duration (ms).
 * A locked slot auto-expires after this period if not confirmed.
 */
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  // Atomic: succeeds if the slot is AVAILABLE, or if it's still marked
  // LOCKED but that lock has already expired. The $or branch is defense in
  // depth — a slot must be immediately re-lockable at read time regardless
  // of how often the cleanup cron actually runs (it may not run every
  // minute on every hosting platform, e.g. Vercel's Hobby tier).
  const lockedSlot = await Slot.findOneAndUpdate(
    {
      _id: slotId,
      // A slot that has already started can't be booked — only present/
      // future slots. Checked atomically here (not as a separate query)
      // so it can't race with the status check below it.
      startTime: { $gt: now },
      $or: [{ status: "AVAILABLE" }, { status: "LOCKED", lockExpiresAt: { $lt: now } }],
    },
    {
      status: "LOCKED",
      lockedBy: userId,
      lockExpiresAt,
    },
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
  // Atomic: only succeeds if slot is LOCKED by this user
  const slot = await Slot.findOneAndUpdate(
    {
      _id: slotId,
      status: "LOCKED",
      lockedBy: userId,
    },
    {
      status: "BOOKED",
      lockedBy: null,
      lockExpiresAt: null,
    },
    { new: true }
  );

  if (!slot) {
    throw new ApiError(409, "Slot lock expired or was not locked by you");
  }

  // Create the booking record
  const booking = await Booking.create({
    userId,
    turfId: slot.turfId,
    slotId: slot._id,
    status: "CONFIRMED",
    amount: slot.price,
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
          { status: "AVAILABLE", lockedBy: null, lockExpiresAt: null }
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

  // Update booking status
  booking.status = "CANCELLED";
  await booking.save();

  // Release the slot back to AVAILABLE (clear all lock/booking state)
  await Slot.findByIdAndUpdate(booking.slotId, {
    status: "AVAILABLE",
    bookingId: null,
    lockedBy: null,
    lockExpiresAt: null,
  });

  return booking;
};

/**
 * Get bookings for a specific turf (owner view).
 */
export const getBookingsByTurf = async (turfId) => {
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
