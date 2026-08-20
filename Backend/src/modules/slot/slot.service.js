import Slot from "./slot.model.js";
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import { releaseExpiredLocks } from "../../common/jobs/releaseExpiredLocks.js";

/**
 * Create slots for a turf (owner only).
 * Accepts an array of slot objects for bulk creation.
 */
export const createSlots = async (ownerId, turfId, slots) => {
  // Verify the turf belongs to this owner
  const turf = await Turf.findById(turfId);
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  // To prevent duplicates, we clear existing unbooked slots for these time ranges
  const startTimes = slots.map(s => new Date(s.startTime));
  await Slot.deleteMany({
    turfId,
    status: { $ne: "BOOKED" },
    startTime: { $in: startTimes }
  });

  // Attach turfId to each slot
  const slotDocs = slots.map((slot) => ({
    ...slot,
    turfId,
  }));

  const createdSlots = await Slot.insertMany(slotDocs);
  return createdSlots;
};

/**
 * Get slots for a specific turf.
 * Optionally filter by date range or status.
 */
export const getSlotsByTurf = async (turfId, { date, status, startDate, endDate } = {}) => {
  // Correct any locks that expired since the last cron sweep before reading,
  // so the slot grid never shows a stale "LOCKED" that's actually bookable.
  // Booking correctness doesn't depend on this (lockSlot already re-checks
  // expiry atomically) — this only keeps what's displayed accurate.
  await releaseExpiredLocks();

  const query = { turfId };

  // Filter by specific date or range
  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    query.startTime = { $gte: dayStart, $lte: dayEnd };
  } else if (startDate || endDate) {
    query.startTime = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.startTime.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.startTime.$lte = end;
    }
  }

  // Filter by status
  if (status) {
    query.status = status;
  }

  const slots = await Slot.find(query).sort({ startTime: 1 });
  return slots;
};

export const deleteSlots = async (ownerId, turfId, { date }) => {
  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const query = { turfId, status: { $ne: "BOOKED" } };

  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    query.startTime = { $gte: dayStart, $lte: dayEnd };
  }

  await Slot.deleteMany(query);
};

export const updateSlots = async (ownerId, turfId, { date, price, weekdayPrice, weekendPrice }) => {
  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const baseQuery = { turfId, status: { $ne: "BOOKED" } };

  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    baseQuery.startTime = { $gte: dayStart, $lte: dayEnd };
  }

  if (price) {
    await Slot.updateMany(baseQuery, { $set: { price } });
  } else if (weekdayPrice && weekendPrice) {
    // Update Weekdays (Mon-Fri: 1-5)
    await Slot.updateMany({ 
      ...baseQuery, 
      $expr: { $and: [{ $gte: [{ $dayOfWeek: "$startTime" }, 2] }, { $lte: [{ $dayOfWeek: "$startTime" }, 6] }] } 
    }, { $set: { price: weekdayPrice } });

    // Update Weekends (Sat-Sun: 7, 1)
    await Slot.updateMany({ 
      ...baseQuery, 
      $expr: { $or: [{ $eq: [{ $dayOfWeek: "$startTime" }, 7] }, { $eq: [{ $dayOfWeek: "$startTime" }, 1] }] } 
    }, { $set: { price: weekendPrice } });
  }
};
