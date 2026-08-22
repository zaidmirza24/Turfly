import User from "../user/user.model.js";
import Turf from "../turf/turf.model.js";
import Booking from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import Payment from "../payment/payment.model.js";
import AuditLog from "./auditLog.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";

/**
 * Record an admin-triggered mutation for the audit trail. Never lets a
 * logging failure block the action it's recording — the mutation has
 * already succeeded by the time this is called, and a broken audit write
 * shouldn't turn that into a 500 for the admin.
 */
export const logAdminAction = async (adminId, action, targetType, targetId, meta) => {
  try {
    await AuditLog.create({ adminId, action, targetType, targetId, meta });
  } catch (err) {
    logger.error("Failed to write admin audit log entry", { err, action, targetType, targetId });
  }
};

/**
 * Platform-wide stats for the admin dashboard, plus a 14-day daily series
 * (bookings + revenue) for the Overview chart. Computed server-side via
 * aggregation since admin volume is platform-wide, unlike the owner
 * dashboard's client-side reduction over one owner's bookings.
 */
export const getStats = async () => {
  const seriesStart = new Date();
  seriesStart.setHours(0, 0, 0, 0);
  seriesStart.setDate(seriesStart.getDate() - 13);

  const [totalUsers, totalTurfs, totalBookings, revenueAgg, dailySeriesRaw] = await Promise.all([
    User.countDocuments(),
    Turf.countDocuments(),
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { status: "CONFIRMED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: seriesStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bookings: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$amount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Fill in days with no bookings so the chart has a continuous x-axis.
  const byDate = new Map(dailySeriesRaw.map((d) => [d._id, d]));
  const dailySeries = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(seriesStart);
    date.setDate(date.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    dailySeries.push({ date: key, bookings: entry?.bookings ?? 0, revenue: entry?.revenue ?? 0 });
  }

  return {
    totalUsers,
    totalTurfs,
    totalBookings,
    totalRevenue: revenueAgg[0]?.total || 0,
    dailySeries,
  };
};

/**
 * All turfs, any approval status (admin view), paginated with optional
 * status/search filters.
 */
export const getAllTurfsForAdmin = async ({ page = 1, limit = 20, status, search } = {}) => {
  const query = {};
  if (status) query.approvalStatus = status;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: regex }, { location: regex }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Turf.find(query)
      .populate("ownerId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Turf.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Single turf detail for the admin approval queue — owner info plus a slot
 * status breakdown, so an admin can see how "live" a turf already is before
 * approving it.
 */
export const getTurfDetailForAdmin = async (turfId) => {
  const turf = await Turf.findById(turfId).populate("ownerId", "name email phone");
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }

  const slotCounts = await Slot.aggregate([
    { $match: { turfId: turf._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const slotSummary = slotCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});

  return { turf, slotSummary };
};

export const setTurfApproval = async (adminId, turfId, approvalStatus) => {
  const turf = await Turf.findByIdAndUpdate(turfId, { approvalStatus }, { new: true });
  if (!turf) {
    throw new ApiError(404, "Turf not found");
  }
  await logAdminAction(
    adminId,
    approvalStatus === "APPROVED" ? "TURF_APPROVED" : "TURF_REJECTED",
    "TURF",
    turf._id,
    { name: turf.name }
  );
  return turf;
};

/**
 * All users (admin view), paginated with optional search/role filters.
 */
export const getAllUsers = async ({ page = 1, limit = 20, search, role } = {}) => {
  const query = {};
  if (role) query.role = role;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: regex }, { email: regex }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
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
export const setUserBanned = async (adminId, userId, isBanned) => {
  const target = await User.findById(userId).select("role");
  if (!target) {
    throw new ApiError(404, "User not found");
  }
  if (target.role === "ADMIN") {
    throw new ApiError(403, "Admin accounts cannot be banned");
  }

  const user = await User.findByIdAndUpdate(userId, { isBanned }, { new: true }).select("-password");
  await logAdminAction(adminId, isBanned ? "USER_BANNED" : "USER_UNBANNED", "USER", userId);
  return user;
};

/**
 * All bookings platform-wide (admin view) — same query/pagination shape as
 * the owner's getOwnerBookings, but with no owner/turf-ownership scoping.
 */
/**
 * Phase 14 — admin payment filters. `paymentStatus` maps onto Payment.status
 * (CREATED/ORDER_CREATED/AUTHORIZED/PAID/FAILED/EXPIRED/PAID_BOOKING_FAILED);
 * "REFUNDED"/"PARTIALLY_REFUNDED" read off Booking.refundStatus instead,
 * since a payment can be PAID while only one booking in its group has been
 * refunded. Booking has no Payment.status of its own to query directly, so a
 * paymentStatus filter is resolved as a Payment lookup first.
 */
export const getAllBookingsForAdmin = async ({ page = 1, limit = 20, from, to, turfId, status, paymentStatus, refundStatus } = {}) => {
  const query = {};
  if (turfId) query.turfId = turfId;
  if (status) query.status = status;
  if (refundStatus) query.refundStatus = refundStatus;
  if (paymentStatus) {
    const paymentIds = await Payment.find({ status: paymentStatus }).select("_id");
    query.paymentId = { $in: paymentIds.map((p) => p._id) };
  }
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Booking.find(query)
      .populate("userId", "name email phone")
      .populate("turfId", "name location sportsType")
      .populate("slotId", "startTime endTime price")
      .populate("paymentId", "status razorpayOrderId razorpayPaymentId amount currency refunds failureReason paidAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Aggregated customer list, platform-wide (admin view) — same shape as the
 * owner's getOwnerCustomers, but matching every booking on the platform.
 */
export const getAllCustomersForAdmin = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;

  const basePipeline = [
    {
      $group: {
        _id: "$userId",
        totalBookings: { $sum: 1 },
        confirmedCount: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
        totalSpent: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$amount", 0] } },
        lastBookingAt: { $max: "$createdAt" },
      },
    },
    { $sort: { lastBookingAt: -1 } },
  ];

  const [countResult] = await Booking.aggregate([...basePipeline, { $count: "total" }]);
  const total = countResult?.total ?? 0;

  const items = await Booking.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        email: "$user.email",
        phone: "$user.phone",
        isGuest: "$user.isGuest",
        totalBookings: 1,
        confirmedCount: 1,
        cancelledCount: 1,
        totalSpent: 1,
        lastBookingAt: 1,
      },
    },
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * One customer's full detail, platform-wide (admin view) — every booking
 * they've ever made anywhere, not just at one owner's turfs.
 */
export const getCustomerDetailForAdmin = async (customerId) => {
  const bookings = await Booking.find({ userId: customerId })
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime price")
    .sort({ createdAt: -1 });

  const customer = await User.findById(customerId).select("name email phone isGuest");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const stats = {
    totalBookings: bookings.length,
    confirmedCount: confirmed.length,
    cancelledCount: bookings.length - confirmed.length,
    totalSpent: confirmed.reduce((sum, b) => sum + b.amount, 0),
  };

  return { customer, stats, bookings };
};

/**
 * Paginated feed of admin actions, newest first.
 */
export const getAuditLog = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find()
      .populate("adminId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};
