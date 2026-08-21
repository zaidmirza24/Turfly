import Slot from "./slot.model.js";
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import { releaseExpiredLocks } from "../../common/jobs/releaseExpiredLocks.js";
import { istDateTime, istDayBounds, nextDateKey, istHour } from "../../common/utils/istTime.js";

/**
 * True when a slot starting at `start` falls inside `turf`'s configured
 * operating window. Mirrors `provisionDefaultSlots`' own loop (`for h =
 * openHour; h <= closeHour; h++`) exactly: `closeHour` is the *start* hour of
 * the last bookable slot of the day (e.g. openHour 6 / closeHour 22 means the
 * last slot starts at 22:00), not a closing-time boundary — so this checks
 * only the start hour, the same thing default provisioning already relies on.
 * Applied to the two paths that take an arbitrary start straight from the
 * request (createSlots, setSlotsStatus), which otherwise had no such check.
 */
export const isWithinOperatingHours = (turf, start) => {
  if (turf.is24x7 !== false) return true;
  const openHour = turf.openHour ?? 0;
  const closeHour = turf.closeHour ?? 23;
  const startHour = istHour(start);
  return startHour >= openHour && startHour <= closeHour;
};

/**
 * Create slots for a turf (owner only).
 * Accepts an array of slot objects for bulk creation.
 */
// One request may generate at most this many slot documents. The owner UI's
// bulk generator multiplies days x hours with no ceiling of its own, so a
// "365 days" entry would otherwise post ~8,760 documents in a single request
// (a deleteMany plus an insertMany of that size) — enough to stall the API for
// every other caller. 62 days of 24h slots fits comfortably under the cap.
const MAX_SLOTS_PER_REQUEST = 1500;

export const createSlots = async (ownerId, turfId, slots) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new ApiError(400, "At least one slot is required");
  }
  if (slots.length > MAX_SLOTS_PER_REQUEST) {
    throw new ApiError(
      400,
      `You can create at most ${MAX_SLOTS_PER_REQUEST} slots in one request — generate a shorter date range`
    );
  }

  for (const slot of slots) {
    const start = new Date(slot?.startTime);
    const end = new Date(slot?.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(400, "Each slot needs a valid startTime and endTime");
    }
    if (end <= start) {
      throw new ApiError(400, "A slot's endTime must be after its startTime");
    }
    if (typeof slot.price !== "number" || !Number.isFinite(slot.price) || slot.price < 0) {
      throw new ApiError(400, "Each slot needs a non-negative numeric price");
    }
  }

  // Verify the turf belongs to this owner
  const turf = await Turf.findById(turfId);
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  for (const slot of slots) {
    if (!isWithinOperatingHours(turf, new Date(slot.startTime))) {
      throw new ApiError(
        400,
        `Slot at ${slot.startTime} falls outside this turf's operating hours (${turf.openHour}:00–${turf.closeHour}:00 IST)`
      );
    }
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
  // Self-healing lock expiry, scoped to this turf: reading a schedule is what
  // corrects it, so no scheduled job is needed. Booking correctness doesn't
  // depend on this at all — lockSlot re-checks expiry atomically — this only
  // keeps the grid from showing a stale "LOCKED" that's actually bookable.
  await releaseExpiredLocks({ turfId });

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

  if (slots.length > MAX_SLOTS_PER_REQUEST) {
    throw new ApiError(400, `You can update at most ${MAX_SLOTS_PER_REQUEST} slots in one request`);
  }

  const updated = [];
  for (const { startTime, endTime } of slots) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new ApiError(400, "Each slot needs a valid startTime and a later endTime");
    }

    // Only checked for the status that actually makes an hour bookable —
    // CLOSED/FULL outside operating hours is harmless (it's already
    // unbookable), but AVAILABLE outside them would open up a slot outside
    // the hours createSlots itself now enforces.
    if (status === "AVAILABLE" && !isWithinOperatingHours(turf, start)) {
      throw new ApiError(
        400,
        `${startTime} falls outside this turf's operating hours (${turf.openHour}:00–${turf.closeHour}:00 IST)`
      );
    }

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

  // LOCKED is excluded alongside BOOKED: a customer mid-checkout has already
  // been shown (and, via Slot.lockedPrice, will actually be charged) the
  // price at lock time, so repricing the slot under them here would only
  // create a confusing mismatch between the grid and what they're paying.
  const baseQuery = { turfId, status: { $nin: ["BOOKED", "LOCKED"] } };

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
