import * as slotService from "./slot.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import ApiError from "../../common/utils/ApiError.js";
import { toPaise } from "../../common/utils/money.js";
import { istDayBounds } from "../../common/utils/istTime.js";

export const createSlots = async (req, res) => {
  const { turfId, slots } = req.body;
  const createdSlots = await slotService.createSlots(
    req.user._id,
    turfId,
    slots
  );
  new ApiResponse(201, "Slots created successfully", createdSlots).send(res);
};

// The widest range any screen actually asks for is one calendar month (the
// availability calendar); the booking picker asks for two days. This ceiling
// is deliberately looser than both, and matches slot.service's own
// MAX_PROVISION_DAYS so it can never reject a range that would have been
// legal to provision.
const MAX_RANGE_DAYS = 62;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const assertDateKey = (value, field) => {
  if (value !== undefined && (typeof value !== "string" || !DATE_KEY.test(value))) {
    throw new ApiError(400, `${field} must be a date in YYYY-MM-DD format`);
  }
};

export const getSlots = async (req, res) => {
  const { turfId, date, status, startDate, endDate } = req.query;
  // Required: without it the query degenerates to `{ turfId: undefined }`,
  // which Mongo reads as "every slot on the platform" — an unauthenticated
  // request that returns the entire slot collection.
  if (typeof turfId !== "string" || turfId.length === 0) {
    throw new ApiError(400, "turfId is required");
  }

  assertDateKey(date, "date");
  assertDateKey(startDate, "startDate");
  assertDateKey(endDate, "endDate");

  // This endpoint doesn't just read — a bounded range provisions any missing
  // slot documents for it (slot.service.js provisionDefaultSlots), so the span
  // a caller asks for directly controls how much this writes. Unbounded, a
  // single anonymous request could ask for years and force the creation of
  // tens of thousands of documents.
  if (startDate && endDate) {
    if (endDate < startDate) {
      throw new ApiError(400, "endDate must not be before startDate");
    }
    const spanDays = Math.round(
      (istDayBounds(endDate).start - istDayBounds(startDate).start) / (24 * 60 * 60 * 1000)
    ) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      throw new ApiError(400, `Date range is too wide — request at most ${MAX_RANGE_DAYS} days at a time`);
    }
  }

  const slots = await slotService.getSlotsByTurf(turfId, { date, status, startDate, endDate });
  new ApiResponse(200, "Slots fetched successfully", slots).send(res);
};

export const deleteSlots = async (req, res) => {
  const { turfId, date } = req.query;
  if (typeof turfId !== "string" || turfId.length === 0) {
    throw new ApiError(400, "turfId is required");
  }
  await slotService.deleteSlots(req.user._id, turfId, { date });
  new ApiResponse(200, "Slots cleared successfully").send(res);
};

// `price`/`weekdayPrice`/`weekendPrice` on the wire are per-hour rupee rates —
// the same numbers the owner typed into the turf's rate fields. updateSlots
// converts them to per-slot prices; this only crosses the rupee→paise boundary.
export const updateSlots = async (req, res) => {
  const { turfId, date, price, weekdayPrice, weekendPrice } = req.body;
  await slotService.updateSlots(req.user._id, turfId, {
    date,
    hourlyPricePaise: price != null ? toPaise(price) : undefined,
    weekdayHourlyPricePaise: weekdayPrice != null ? toPaise(weekdayPrice) : undefined,
    weekendHourlyPricePaise: weekendPrice != null ? toPaise(weekendPrice) : undefined,
  });
  new ApiResponse(200, "Slots updated successfully").send(res);
};

export const setSlotsStatus = async (req, res) => {
  const { turfId, slots, status } = req.body;
  const updated = await slotService.setSlotsStatus(req.user._id, turfId, { slots, status });
  new ApiResponse(200, "Slot status updated", updated).send(res);
};
