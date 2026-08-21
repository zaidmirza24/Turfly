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

/**
 * Ban / unban a user.
 *
 * ADMIN accounts are off limits. `protect` rejects any banned user with a
 * 403 before role checks run, so banning an admin — including yourself, one
 * mis-click away in the users table — locks that account out of the platform
 * permanently with no in-app way back. There is no un-ban path that doesn't
 * require an admin login.
 */
export const setUserBanned = async (userId, isBanned) => {
  const target = await User.findById(userId).select("role");
  if (!target) {
    throw new ApiError(404, "User not found");
  }
  if (target.role === "ADMIN") {
    throw new ApiError(403, "Admin accounts cannot be banned");
  }

  const user = await User.findByIdAndUpdate(userId, { isBanned }, { new: true }).select("-password");
  return user;
};
