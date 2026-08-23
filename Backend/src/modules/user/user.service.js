import { randomUUID } from "crypto";
import User from "./user.model.js";
import Turf from "../turf/turf.model.js";
import Booking from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { attachAvatarImage, rearmImagesByUrl } from "../image/image.service.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/**
 * Owner-only: set/update where the admin should send this owner's payouts
 * (see payout.model.js). Validated shape per method — a UPI id with no
 * bank fields set, or full bank details with no UPI id — since a
 * half-filled record would leave the admin unable to actually act on it.
 */
export const updatePayoutDetails = async (userId, data) => {
  const method = data?.method;
  if (method !== "UPI" && method !== "BANK") {
    throw new ApiError(400, "Payout method must be UPI or BANK");
  }

  let payoutDetails;
  if (method === "UPI") {
    const upiId = typeof data.upiId === "string" ? data.upiId.trim() : "";
    if (!/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(upiId)) {
      throw new ApiError(400, "A valid UPI id is required (e.g. name@bank)");
    }
    payoutDetails = { method, upiId, bankAccountHolder: null, bankAccountNumber: null, bankIfsc: null };
  } else {
    const bankAccountHolder = typeof data.bankAccountHolder === "string" ? data.bankAccountHolder.trim() : "";
    const bankAccountNumber = typeof data.bankAccountNumber === "string" ? data.bankAccountNumber.trim() : "";
    const bankIfsc = typeof data.bankIfsc === "string" ? data.bankIfsc.trim().toUpperCase() : "";
    if (!bankAccountHolder) {
      throw new ApiError(400, "Account holder name is required");
    }
    if (!/^[0-9]{6,20}$/.test(bankAccountNumber)) {
      throw new ApiError(400, "A valid bank account number is required");
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
      throw new ApiError(400, "A valid IFSC code is required");
    }
    payoutDetails = { method, upiId: null, bankAccountHolder, bankAccountNumber, bankIfsc };
  }

  const user = await User.findByIdAndUpdate(userId, { payoutDetails }, { new: true });
  if (!user) throw new ApiError(404, "User not found");
  logger.info("Payout details updated", { userId: String(userId), method });
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

/**
 * Search customers for the manual-booking flow. Scoped to users who have
 * actually booked at one of this owner's turfs, or guests this owner created
 * — never the whole platform's users, which would let any owner harvest
 * every other owner's customer PII by search term alone.
 */
export const searchCustomers = async (ownerId, query) => {
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    throw new ApiError(400, "Search query must be at least 2 characters");
  }

  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);
  const bookedUserIds = await Booking.find({ turfId: { $in: turfIds } }).distinct("userId");

  const regex = new RegExp(escapeRegex(query.trim()), "i");
  const customers = await User.find({
    $and: [
      { $or: [{ _id: { $in: bookedUserIds } }, { createdByOwnerId: ownerId }] },
      { $or: [{ name: regex }, { phone: regex }, { email: regex }] },
      { isDeleted: { $ne: true } },
    ],
  })
    .select("name email phone isGuest")
    .limit(10);

  return customers;
};

/**
 * Quick-create a walk-in customer with no real account (name + phone only) so
 * an owner can record a phone/walk-in booking without forcing the customer to
 * register. Guests get an unusable random password and a synthetic unique
 * email — they can never log in, mirroring how a real front-desk log works.
 */
export const createGuestCustomer = async (ownerId, { name, phone }) => {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new ApiError(400, "Customer name is required");
  }
  const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
  if (!/^\+?[0-9]{7,15}$/.test(trimmedPhone)) {
    throw new ApiError(400, "A valid phone number is required");
  }

  const guest = await User.create({
    name: name.trim(),
    email: `guest-${randomUUID()}@turfly.invalid`,
    phone: trimmedPhone,
    password: randomUUID(),
    role: "USER",
    isGuest: true,
    createdByOwnerId: ownerId,
  });

  return guest;
};
