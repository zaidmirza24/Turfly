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

export const updateTurf = async (turfId, ownerId, data) => {
  const turf = await Turf.findById(turfId);
  if (!turf) throw new ApiError(404, "Turf not found");
  if (turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You do not own this turf");
  }

  const updatedTurf = await Turf.findByIdAndUpdate(turfId, { $set: data }, { new: true });
  return updatedTurf;
};
