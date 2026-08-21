import User from "./user.model.js";
import Turf from "../turf/turf.model.js";
import Booking from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { attachAvatarImage, rearmImagesByUrl } from "../image/image.service.js";

const PROFILE_EDITABLE_FIELDS = ["name", "phone"];

export const getMe = async (userId) => {
  const user = await User.findById(userId).populate("favorites", "name location images pricePerHour avgRating reviewCount");
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

export const updateMe = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const safeData = {};
  for (const field of PROFILE_EDITABLE_FIELDS) {
    if (data[field] !== undefined) safeData[field] = data[field];
  }

  if (data.avatar !== undefined) {
    const previousAvatar = user.avatar;
    safeData.avatar = await attachAvatarImage(userId, data.avatar);
    if (previousAvatar && previousAvatar !== safeData.avatar) {
      await rearmImagesByUrl([previousAvatar]);
    }
  }

  Object.assign(user, safeData);
  await user.save();
  logger.info("Profile updated", { userId: String(userId), fields: Object.keys(safeData) });
  return user;
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await user.comparePassword(currentPassword ?? "");
  if (!isMatch) {
    throw new ApiError(401, "Current password is incorrect");
  }

  user.password = newPassword; // re-hashed by the pre('save') hook
  await user.save();
  logger.info("Password changed", { userId: String(userId) });
};

/**
 * Soft-delete the caller's own account (USER role only).
 *
 * Refused for OWNER/ADMIN — an owner's account is load-bearing for their
 * turfs' bookings and revenue history, and there's no product flow yet for
 * transferring or winding those down. Refused while an upcoming CONFIRMED
 * booking exists so a deletion never silently strands a venue expecting a
 * customer who technically no longer exists; the customer just needs to
 * cancel first, which is always allowed up to 6 hours out.
 */
export const deleteMe = async (userId, password) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  if (user.role !== "USER") {
    throw new ApiError(403, "Owner and admin accounts can't be self-deleted here — contact support");
  }

  const isMatch = await user.comparePassword(password ?? "");
  if (!isMatch) {
    throw new ApiError(401, "Password is incorrect");
  }

  const confirmedSlotIds = await Booking.find({ userId, status: "CONFIRMED" }).distinct("slotId");
  const hasUpcomingSlot = confirmedSlotIds.length > 0 && await Slot.exists({
    _id: { $in: confirmedSlotIds },
    startTime: { $gt: new Date() },
  });
  if (hasUpcomingSlot) {
    throw new ApiError(409, "You have upcoming bookings — cancel them before deleting your account");
  }

  if (user.avatar) await rearmImagesByUrl([user.avatar]);

  user.isDeleted = true;
  user.name = "Deleted User";
  user.email = `deleted-${user._id}@turfly.invalid`;
  user.phone = null;
  user.avatar = null;
  user.favorites = [];
  await user.save();

  logger.info("Account deleted", { userId: String(userId) });
};

export const addFavorite = async (userId, turfId) => {
  const turf = await Turf.findOne({ _id: turfId, isActive: true, approvalStatus: "APPROVED" }).select("_id");
  if (!turf) throw new ApiError(404, "Turf not found");

  await User.findByIdAndUpdate(userId, { $addToSet: { favorites: turfId } });
};

export const removeFavorite = async (userId, turfId) => {
  await User.findByIdAndUpdate(userId, { $pull: { favorites: turfId } });
};

export const getFavorites = async (userId) => {
  const user = await User.findById(userId).populate({
    path: "favorites",
    match: { isActive: true, approvalStatus: "APPROVED" },
  });
  if (!user) throw new ApiError(404, "User not found");
  return user.favorites;
};
