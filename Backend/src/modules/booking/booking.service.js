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

  // Atomic: only succeeds if slot is currently AVAILABLE
  const lockedSlot = await Slot.findOneAndUpdate(
    { _id: slotId, status: "AVAILABLE" },
    {
      status: "LOCKED",
      lockedBy: userId,
      lockExpiresAt,
    },
    { new: true }
  );

  if (!lockedSlot) {
    // Either slot doesn't exist OR was already LOCKED/BOOKED
    const exists = await Slot.findById(slotId);
    if (!exists) {
      throw new ApiError(404, "Slot not found");
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
export const confirmSlot = async (userId, slotId) => {
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
