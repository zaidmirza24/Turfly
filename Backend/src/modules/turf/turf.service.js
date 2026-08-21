import Turf from "./turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { attachImagesToTurf } from "../image/image.service.js";

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
];

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

  // Images are validated before the turf exists, so the ids are checked for
  // ownership up front and the attachment is recorded immediately after.
  const requestedImages = safeData.images;
  delete safeData.images;

  const turf = await Turf.create({
    ...safeData,
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

/**
 * Get all active turfs (public).
 */
export const getAllTurfs = async (filter = {}, { limit } = {}) => {
  let query = Turf.find(filter)
    .populate("ownerId", "name email")
    .sort({ createdAt: -1 });

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

  // Never persisted as given: every entry must resolve to an image this owner
  // uploaded, or the field becomes a way to point the site at arbitrary
  // third-party URLs. attachImagesToTurf returns the normalised list.
  if (safeData.images !== undefined) {
    safeData.images = await attachImagesToTurf(ownerId, turfId, safeData.images);
  }

  const updatedTurf = await Turf.findByIdAndUpdate(turfId, { $set: safeData }, { new: true });

  logger.info("Turf updated", { turfId: String(turfId), fields: Object.keys(safeData) });
  return updatedTurf;
};
