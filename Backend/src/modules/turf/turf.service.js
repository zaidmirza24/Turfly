import Turf from "./turf.model.js";
import Slot from "../slot/slot.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { attachImagesToTurf } from "../image/image.service.js";
import { geocodeLocation } from "./geocode.js";
import { updateSlots as updateSlotPrices } from "../slot/slot.service.js";
import { toPaise } from "../../common/utils/money.js";

// Fields whose change should propagate to already-generated, not-yet-booked
// Slot documents. Without this, editing a turf's rate only affects slots
// provisioned *after* the edit — every slot already on the calendar (which is
// what both the owner's grid and the customer's booking page actually read
// price from) keeps showing the old number until an owner separately opens
// Slot Management and hits "Sync Schedule".
const PRICING_FIELDS = ["pricePerHour", "defaultWeekdayPrice", "defaultWeekendPrice"];

// Requests carry these three fields as rupees (the wire contract the
// frontend speaks); the schema stores their paise equivalents under these
// keys. Converted once here, right at the input boundary.
const PRICING_FIELD_TO_PAISE_KEY = {
  pricePerHour: "pricePerHourPaise",
  defaultWeekdayPrice: "defaultWeekdayPricePaise",
  defaultWeekendPrice: "defaultWeekendPricePaise",
};

// Fields an owner may edit on their own turf via PATCH /api/turfs/:id.
// ownerId and approvalStatus are deliberately excluded — approvalStatus is
// admin-only (set via /api/admin/turfs/:id/approve|reject); allowing it here
// would let an owner self-approve a listing that was never actually reviewed.
const OWNER_EDITABLE_FIELDS = [
  "name",
  "location",
  "description",
  "sportsType",
  "amenities",
  "images",
  "pricePerHour",
  "defaultWeekdayPrice",
  "defaultWeekendPrice",
  "isActive",
  "is24x7",
  "openHour",
  "closeHour",
  "venueType",
  "capacity",
  "contactPhone",
  "rules",
  "faqs",
];

// How far ahead "Available now" looks for an open slot — a slot that opens
// in the next couple of hours is still useful to someone deciding right now,
// while one that's actually in progress may already be too late to catch.
const AVAILABLE_NOW_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Mutates safeData in place: replaces rupee pricing keys with their paise
 * schema equivalents, right before the doc is written. */
const convertPricingToPaise = (safeData) => {
  for (const [rupeeField, paiseField] of Object.entries(PRICING_FIELD_TO_PAISE_KEY)) {
    if (safeData[rupeeField] !== undefined) {
      safeData[paiseField] = toPaise(safeData[rupeeField]);
      delete safeData[rupeeField];
    }
  }
};

/**
 * Create a new turf (owner only).
 *
 * Built field-by-field from a whitelist rather than spreading the request
 * body: `approvalStatus` is part of the schema, so `{...data}` let an owner
 * post `approvalStatus: "APPROVED"` at creation time and put a listing live
 * without it ever being reviewed — the exact check the PATCH path already
 * refuses (see OWNER_EDITABLE_FIELDS). Every new turf starts PENDING.
 */
export const createTurf = async (ownerId, data) => {
  const safeData = {};
  for (const field of OWNER_EDITABLE_FIELDS) {
    if (data[field] !== undefined) safeData[field] = data[field];
  }
  convertPricingToPaise(safeData);

  // Images are validated before the turf exists, so the ids are checked for
  // ownership up front and the attachment is recorded immediately after.
  const requestedImages = safeData.images;
  delete safeData.images;

  const geo = await geocodeLocation(safeData.location);

  const turf = await Turf.create({
    ...safeData,
    ...(geo ? { geo } : {}),
    ownerId,
    approvalStatus: "PENDING",
  });

  if (requestedImages !== undefined) {
    turf.images = await attachImagesToTurf(ownerId, turf._id, requestedImages);
    await turf.save();
  }

  logger.info("Turf created", { turfId: turf._id.toString(), images: turf.images.length });
  return turf;
};

const SORT_STAGES = {
  price_asc: { pricePerHourPaise: 1 },
  price_desc: { pricePerHourPaise: -1 },
  rating: { avgRating: -1, reviewCount: -1 },
  popularity: { bookingCount: -1 },
  newest: { createdAt: -1 },
};

/**
 * Get all active turfs (public).
 *
 * `near`/`availableNow` are opt-in extras layered on top of the plain
 * `filter` — most callers (owner's-own-turfs, admin) pass neither and get
 * the original createdAt-sorted listing untouched.
 */
export const getAllTurfs = async (filter = {}, { limit, sortBy, near, availableNow } = {}) => {
  let effectiveFilter = filter;

  if (availableNow) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + AVAILABLE_NOW_WINDOW_MS);
    const openTurfIds = await Slot.distinct("turfId", {
      status: "AVAILABLE",
      startTime: { $gte: now, $lte: windowEnd },
    });
    effectiveFilter = { ...filter, _id: { $in: openTurfIds } };
  }

  // A $geoNear-sorted result can't also be populated via a plain .find(), so
  // "near" runs as its own aggregation pipeline; everything else keeps using
  // the simpler find()/sort()/limit() chain.
  if (near) {
    const geoNearStage = {
      near: { type: "Point", coordinates: [near.lng, near.lat] },
      distanceField: "distanceMeters",
      spherical: true,
      query: effectiveFilter,
    };
    if (near.maxDistanceKm) {
      geoNearStage.maxDistance = near.maxDistanceKm * 1000; // meters
    }
    const pipeline = [{ $geoNear: geoNearStage }];
    if (limit) pipeline.push({ $limit: Number(limit) });
    pipeline.push(
      { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "ownerId" } },
      { $unwind: { path: "$ownerId", preserveNullAndEmptyArrays: true } }
    );
    return Turf.aggregate(pipeline);
  }

  let query = Turf.find(effectiveFilter)
    .populate("ownerId", "name email")
    .sort(SORT_STAGES[sortBy] || SORT_STAGES.newest);

  if (limit) {
    query = query.limit(Number(limit));
  }

  return query;
};

/**
 * Get single turf by ID (public).
 *
 * A turf that isn't live (still awaiting review, rejected, or deactivated by
 * its owner) is treated as non-existent here. Without this, the listing's
 * approval gate is only a filter on one endpoint — anyone with the id could
 * still open the public detail page of an unreviewed venue and try to book it.
 */
export const getTurfById = async (turfId) => {
  const turf = await Turf.findById(turfId).populate("ownerId", "name email");
  if (!turf || !turf.isActive || turf.approvalStatus !== "APPROVED") {
    throw new ApiError(404, "Turf not found");
  }
  return turf;
};

/** True when a turf is live and may accept new bookings. */
export const isTurfBookable = (turf) =>
  Boolean(turf) && turf.isActive === true && turf.approvalStatus === "APPROVED";


export const updateTurf = async (turfId, ownerId, data) => {
  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const safeData = {};
  for (const field of OWNER_EDITABLE_FIELDS) {
    if (data[field] !== undefined) safeData[field] = data[field];
  }
  convertPricingToPaise(safeData);

  // Never persisted as given: every entry must resolve to an image this owner
  // uploaded, or the field becomes a way to point the site at arbitrary
  // third-party URLs. attachImagesToTurf returns the normalised list.
  if (safeData.images !== undefined) {
    safeData.images = await attachImagesToTurf(ownerId, turfId, safeData.images);
  }

  // Re-resolve coordinates whenever the address text actually changes, so an
  // owner correcting a typo'd location also fixes distance/map for it —
  // but a same-value edit or an edit of unrelated fields shouldn't spend a
  // Nominatim lookup for nothing.
  if (safeData.location !== undefined && safeData.location !== turf.location) {
    const geo = await geocodeLocation(safeData.location);
    if (geo) safeData.geo = geo;
  }

  const updatedTurf = await Turf.findByIdAndUpdate(turfId, { $set: safeData }, { new: true });

  if (Object.values(PRICING_FIELD_TO_PAISE_KEY).some((f) => f in safeData)) {
    // All three of these are per-hour rates; updateSlotPrices converts them to
    // per-slot prices itself (slot.service.js hourlyRateToSlotPricePaise).
    if (updatedTurf.defaultWeekdayPricePaise != null && updatedTurf.defaultWeekendPricePaise != null) {
      await updateSlotPrices(ownerId, turfId, {
        weekdayHourlyPricePaise: updatedTurf.defaultWeekdayPricePaise,
        weekendHourlyPricePaise: updatedTurf.defaultWeekendPricePaise,
      });
    } else if (safeData.pricePerHourPaise !== undefined) {
      await updateSlotPrices(ownerId, turfId, { hourlyPricePaise: updatedTurf.pricePerHourPaise });
    }
  }

  logger.info("Turf updated", { turfId: String(turfId), fields: Object.keys(safeData) });
  return updatedTurf;
};
