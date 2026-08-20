import User from "../user/user.model.js";
import Turf from "../turf/turf.model.js";
import Booking from "../booking/booking.model.js";
import ApiError from "../../common/utils/ApiError.js";

/**
 * Platform-wide stats for the admin dashboard.
 */
export const getStats = async () => {
  const [totalUsers, totalTurfs, totalBookings, revenueAgg] = await Promise.all([
    User.countDocuments(),
    Turf.countDocuments(),
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { status: "CONFIRMED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return {
    totalUsers,
    totalTurfs,
    totalBookings,
    totalRevenue: revenueAgg[0]?.total || 0,
  };
};

/**
 * All turfs, any approval status (admin view).
 */
export const getAllTurfsForAdmin = async () => {
  return Turf.find().populate("ownerId", "name email").sort({ createdAt: -1 });
};

export const setTurfApproval = async (turfId, approvalStatus) => {
  const turf = await Turf.findByIdAndUpdate(turfId, { approvalStatus }, { new: true });
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  return turf;
};

/**
 * All users (admin view).
 */
export const getAllUsers = async () => {
  return User.find().select("-password").sort({ createdAt: -1 });
};

export const setUserBanned = async (userId, isBanned) => {
  const user = await User.findByIdAndUpdate(userId, { isBanned }, { new: true }).select("-password");
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return user;
};
