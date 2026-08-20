import Turf from "./turf.model.js";
import ApiError from "../../common/utils/ApiError.js";

/**
 * Create a new turf (owner only).
 */
export const createTurf = async (ownerId, data) => {
  const turf = await Turf.create({ ...data, ownerId });
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
 */
export const getTurfById = async (turfId) => {
  const turf = await Turf.findById(turfId).populate("ownerId", "name email");
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  return turf;
};

// Fields an owner may edit on their own turf via PATCH /api/turfs/:id.
// ownerId and approvalStatus are deliberately excluded — approvalStatus is
// admin-only (set via /api/admin/turfs/:id/approve|reject); allowing it here
// would let an owner self-approve a listing that was never actually reviewed.
const OWNER_EDITABLE_FIELDS = [
  "name",
  "location",
  "sportsType",
  "amenities",
  "pricePerHour",
  "defaultWeekdayPrice",
  "defaultWeekendPrice",
  "isActive",
  "is24x7",
  "openHour",
  "closeHour",
];

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

  const updatedTurf = await Turf.findByIdAndUpdate(turfId, { $set: safeData }, { new: true });
  return updatedTurf;
};
