import Slot from "./slot.model.js";
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import { releaseExpiredLocks } from "../../common/jobs/releaseExpiredLocks.js";
import { istDateTime, istDayBounds, nextDateKey } from "../../common/utils/istTime.js";

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

  // Build slot docs from only the fields a caller should be able to set —
  // spreading the raw request body would let a client inject `status:
  // "BOOKED"` or a fake `bookingId` on creation.
  const slotDocs = slots.map((slot) => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    price: slot.price,
    turfId,
  }));

  const createdSlots = await Slot.insertMany(slotDocs);
  return createdSlots;
};

// Hard cap on how many calendar days a single request can trigger default-slot
// provisioning for. Without this, an unauthenticated caller could pass an
// arbitrarily wide startDate/endDate and force the creation of years' worth
// of Slot documents in one request.
const MAX_PROVISION_DAYS = 62;

/**
 * Idempotently create AVAILABLE slots for every operating hour of `turf`
 * across the IST calendar days [startDateKey, endDateKey] ("YYYY-MM-DD",
 * inclusive) that don't already have a Slot document.
 *
 * Product rule: a slot is AVAILABLE by default; the owner only has to act
 * to CLOSE an hour (or mark it FULL) — never to opt hours in one at a time.
 * Hours outside the turf's operating window are simply never generated here,
 * which is what makes them implicitly "closed" without a stored document.
 *
 * Day/hour math goes through istDateTime/nextDateKey (fixed IST offset)
 * rather than Date's local setHours/setDate — those depend on the server
 * process's own timezone, which differs between local dev and production
 * and would silently provision the wrong hours depending on where this runs.
 */
const provisionDefaultSlots = async (turf, startDateKey, endDateKey) => {
  const openHour = turf.is24x7 === false ? (turf.openHour ?? 0) : 0;
  const closeHour = turf.is24x7 === false ? (turf.closeHour ?? 23) : 23;

  const wantedStartTimes = [];
  let cursor = startDateKey;
  for (let i = 0; cursor <= endDateKey && i < MAX_PROVISION_DAYS; i++) {
    for (let h = openHour; h <= closeHour; h++) {
      wantedStartTimes.push(istDateTime(cursor, h));
    }
    cursor = nextDateKey(cursor);
  }

  if (wantedStartTimes.length === 0) return;

  const existing = await Slot.find({
    turfId: turf._id,
    startTime: { $in: wantedStartTimes },
  }).select("startTime").lean();
  const existingTimes = new Set(existing.map((s) => s.startTime.getTime()));

  const toCreate = wantedStartTimes
    .filter((t) => !existingTimes.has(t.getTime()))
    .map((startTime) => {
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
      return { turfId: turf._id, startTime, endTime, price: turf.pricePerHour, status: "AVAILABLE" };
    });

  if (toCreate.length === 0) return;

  try {
    // ordered:false so one duplicate (a concurrent request provisioning the
    // same hour first) doesn't abort the rest of the batch.
    await Slot.insertMany(toCreate, { ordered: false });
  } catch (err) {
    // Duplicate-key errors are expected under concurrent provisioning — the
    // unique (turfId, startTime) index is what makes this idempotent instead
    // of racy. Anything else is a real failure and should still surface.
    if (err.code !== 11000 && !(err.writeErrors?.every((e) => e.code === 11000))) {
      throw err;
    }
  }
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

  // date/startDate/endDate are treated as opaque "YYYY-MM-DD" IST calendar-
  // day keys, never parsed with `new Date(str)` — a date-only string parses
  // as UTC midnight, and mutating it with setHours/setDate afterward uses
  // the server process's *local* timezone, which is a different offset in
  // local dev than in production. istDayBounds/istDateTime sidestep that
  // entirely by working in a fixed IST offset regardless of process TZ.
  const query = { turfId };
  let startKey = null;
  let endKey = null;

  if (date) {
    startKey = date;
    endKey = date;
    const { start, end } = istDayBounds(date);
    query.startTime = { $gte: start, $lte: end };
  } else if (startDate || endDate) {
    query.startTime = {};
    if (startDate) {
      startKey = startDate;
      query.startTime.$gte = istDayBounds(startDate).start;
    }
    if (endDate) {
      endKey = endDate;
      query.startTime.$lte = istDayBounds(endDate).end;
    }
  }

  // Only provision defaults when the request names a bounded date/range —
  // an unbounded "all slots for this turf" query never triggers generation.
  if (startKey && endKey) {
    const turf = await Turf.findById(turfId);
    if (turf) {
      await provisionDefaultSlots(turf, startKey, endKey);
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
    const { start, end } = istDayBounds(date);
    query.startTime = { $gte: start, $lte: end };
  }

  await Slot.deleteMany(query);
};

/**
 * Bulk set the status of specific hourly slots (owner only).
 *
 * Used by the day-timeline UI's drag-select: the owner drags across a range
 * of hours and picks AVAILABLE / CLOSED / FULL. Slots that don't exist yet
 * for a given hour are created on the fly (so an owner can "close" an hour
 * that was never generated). Slots already BOOKED or LOCKED are left alone —
 * an owner can't override a real customer booking or an in-progress checkout
 * from this endpoint; they must go through booking cancellation instead.
 */
export const setSlotsStatus = async (ownerId, turfId, { slots, status }) => {
  const ALLOWED_STATUSES = ["AVAILABLE", "CLOSED", "FULL"];
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new ApiError(400, "Status must be one of AVAILABLE, CLOSED, FULL");
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new ApiError(400, "At least one slot time range is required");
  }

  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const updated = [];
  for (const { startTime, endTime } of slots) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    const existing = await Slot.findOne({ turfId, startTime: start });

    if (existing) {
      if (existing.status === "BOOKED" || existing.status === "LOCKED") {
        continue;
      }
      existing.status = status;
      await existing.save();
      updated.push(existing);
    } else {
      const created = await Slot.create({
        turfId,
        startTime: start,
        endTime: end,
        price: turf.pricePerHour,
        status,
      });
      updated.push(created);
    }
  }

  return updated;
};

export const updateSlots = async (ownerId, turfId, { date, price, weekdayPrice, weekendPrice }) => {
  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const baseQuery = { turfId, status: { $ne: "BOOKED" } };

  if (date) {
    const { start, end } = istDayBounds(date);
    baseQuery.startTime = { $gte: start, $lte: end };
  }

  // $dayOfWeek defaults to UTC — without an explicit timezone, a slot at
  // 12:30am IST Monday (still Sunday evening in UTC) would be classified as
  // Sunday and get weekend pricing instead of weekday pricing.
  const dayOfWeekIST = { $dayOfWeek: { date: "$startTime", timezone: "Asia/Kolkata" } };

  if (price) {
    await Slot.updateMany(baseQuery, { $set: { price } });
  } else if (weekdayPrice && weekendPrice) {
    // Update Weekdays (Mon-Fri: 1-5)
    await Slot.updateMany({
      ...baseQuery,
      $expr: { $and: [{ $gte: [dayOfWeekIST, 2] }, { $lte: [dayOfWeekIST, 6] }] }
    }, { $set: { price: weekdayPrice } });

    // Update Weekends (Sat-Sun: 7, 1)
    await Slot.updateMany({
      ...baseQuery,
      $expr: { $or: [{ $eq: [dayOfWeekIST, 7] }, { $eq: [dayOfWeekIST, 1] }] }
    }, { $set: { price: weekendPrice } });
  }
};
