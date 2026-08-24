import User from "../user/user.model.js";
import Turf from "../turf/turf.model.js";
import Booking, { HONOURED_STATUSES, IS_HONOURED_EXPR } from "../booking/booking.model.js";
import Slot from "../slot/slot.model.js";
import Payment from "../payment/payment.model.js";
import Payout from "../payout/payout.model.js";
import AuditLog from "./auditLog.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { toRupees } from "../../common/utils/money.js";
import { istRangeFilter, istDateKey, istDayBounds, previousDateKey, IST_TIMEZONE } from "../../common/utils/istTime.js";

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
const SERIES_DAYS = 14;

export const getStats = async () => {
  // The 14-day window is a run of IST calendar days, and every part of it has
  // to agree on that. It previously used the server's *local* midnight for the
  // window start, a UTC $dateToString for the buckets, and a UTC key for the
  // fill loop — three different notions of "day" on a platform that operates
  // in one. On Vercel (UTC) that charted every booking before 05:30 IST a day
  // early, so the column an admin read as "today" was missing its own morning.
  const todayKey = istDateKey(new Date());
  const seriesKeys = [];
  let cursor = todayKey;
  for (let i = 0; i < SERIES_DAYS; i++) {
    seriesKeys.unshift(cursor);
    cursor = previousDateKey(cursor);
  }
  const seriesStart = istDayBounds(seriesKeys[0]).start;

  const [totalUsers, totalTurfs, totalBookings, revenueAgg, commissionAgg, payableAgg, paidOutAgg, dailySeriesRaw] = await Promise.all([
    User.countDocuments(),
    Turf.countDocuments(),
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { status: { $in: HONOURED_STATUSES } } },
      { $group: { _id: null, total: { $sum: "$amountPaise" } } },
    ]),
    // Commission actually earned by the platform — ONLINE bookings only,
    // since CASH/PENDING bookings never had the platform holding the money
    // (see booking.model.js's payoutStatus doc comment).
    Booking.aggregate([
      { $match: { status: { $in: HONOURED_STATUSES }, paymentMethod: "ONLINE" } },
      { $group: { _id: null, total: { $sum: "$commissionAmountPaise" } } },
    ]),
    Booking.aggregate([
      { $match: { payoutStatus: "PENDING" } },
      { $group: { _id: null, total: { $sum: "$ownerAmountPaise" } } },
    ]),
    Booking.aggregate([
      { $match: { payoutStatus: "PAID" } },
      { $group: { _id: null, total: { $sum: "$ownerAmountPaise" } } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: seriesStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST_TIMEZONE } },
          bookings: { $sum: 1 },
          revenuePaise: { $sum: { $cond: [IS_HONOURED_EXPR, "$amountPaise", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Fill in days with no bookings so the chart has a continuous x-axis. Walks
  // the same IST keys the buckets were grouped by, so a label and its column
  // always describe the same day.
  const byDate = new Map(dailySeriesRaw.map((d) => [d._id, d]));
  const dailySeries = seriesKeys.map((key) => {
    const entry = byDate.get(key);
    return { date: key, bookings: entry?.bookings ?? 0, revenue: toRupees(entry?.revenuePaise ?? 0) };
  });

  return {
    totalUsers,
    totalTurfs,
    totalBookings,
    totalRevenue: toRupees(revenueAgg[0]?.total || 0),
    totalCommissionEarned: toRupees(commissionAgg[0]?.total || 0),
    totalOwedToOwners: toRupees(payableAgg[0]?.total || 0),
    totalPaidToOwners: toRupees(paidOutAgg[0]?.total || 0),
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
export const getAllBookingsForAdmin = async ({ page = 1, limit = 20, from, to, turfId, status, paymentStatus, refundStatus, payoutStatus } = {}) => {
  const query = {};
  if (turfId) query.turfId = turfId;
  if (status) query.status = status;
  if (refundStatus) query.refundStatus = refundStatus;
  if (payoutStatus) query.payoutStatus = payoutStatus;
  if (paymentStatus) {
    const paymentIds = await Payment.find({ status: paymentStatus }).select("_id");
    query.paymentId = { $in: paymentIds.map((p) => p._id) };
  }
  // Same play-time semantics as the owner's list (booking.service.js
  // playTimeRangeFilter) — a date range on a booking list means "bookings
  // happening then", not "bookings created then", and the day boundaries are
  // IST because that's the timezone the platform operates in.
  const playRange = istRangeFilter(from, to);
  if (playRange) query.slotStartTime = playRange;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Booking.find(query)
      .populate("userId", "name email phone")
      .populate("turfId", "name location sportsType")
      .populate("slotId", "startTime endTime pricePaise")
      .populate("paymentId", "status razorpayOrderId razorpayPaymentId amountPaise currency refunds failureReason paidAt")
      .sort({ slotStartTime: -1 })
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
        confirmedCount: { $sum: { $cond: [IS_HONOURED_EXPR, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
        totalSpentPaise: { $sum: { $cond: [IS_HONOURED_EXPR, "$amountPaise", 0] } },
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
        totalSpentPaise: 1,
        lastBookingAt: 1,
      },
    },
  ]);

  const itemsWithRupees = items.map(({ totalSpentPaise, ...rest }) => ({
    ...rest,
    totalSpent: toRupees(totalSpentPaise),
  }));

  return { items: itemsWithRupees, total, page, pages: Math.ceil(total / limit) || 1 };
};

/**
 * One customer's full detail, platform-wide (admin view) — every booking
 * they've ever made anywhere, not just at one owner's turfs.
 */
export const getCustomerDetailForAdmin = async (customerId) => {
  const bookings = await Booking.find({ userId: customerId })
    .populate("turfId", "name location sportsType")
    .populate("slotId", "startTime endTime pricePaise")
    .sort({ createdAt: -1 });

  const customer = await User.findById(customerId).select("name email phone isGuest");
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const confirmed = bookings.filter((b) => HONOURED_STATUSES.includes(b.status));
  const stats = {
    totalBookings: bookings.length,
    confirmedCount: confirmed.length,
    cancelledCount: bookings.length - confirmed.length,
    totalSpent: toRupees(confirmed.reduce((sum, b) => sum + b.amountPaise, 0)),
  };

  return { customer, stats, bookings };
};

/**
 * Owners with a nonzero pending payout balance — one row per owner, so the
 * admin payouts screen can show "who do I owe money to" without listing
 * every individual booking up front. Drill-down into one owner's actual
 * pending bookings goes through GET /admin/bookings?payoutStatus=PENDING
 * (the existing bookings list already supports filtering that way), scoped
 * to that owner's turfs on the frontend.
 */
export const getPendingPayoutsSummary = async () => {
  const rows = await Booking.aggregate([
    { $match: { payoutStatus: "PENDING" } },
    { $lookup: { from: "turfs", localField: "turfId", foreignField: "_id", as: "turf" } },
    { $unwind: "$turf" },
    {
      $group: {
        _id: "$turf.ownerId",
        pendingAmountPaise: { $sum: "$ownerAmountPaise" },
        pendingCount: { $sum: 1 },
        oldestPendingAt: { $min: "$createdAt" },
      },
    },
    { $sort: { pendingAmountPaise: -1 } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "owner" } },
    { $unwind: "$owner" },
    {
      $project: {
        _id: 0,
        ownerId: "$_id",
        ownerName: "$owner.name",
        ownerEmail: "$owner.email",
        payoutDetails: "$owner.payoutDetails",
        pendingAmountPaise: 1,
        pendingCount: 1,
        oldestPendingAt: 1,
      },
    },
  ]);
  return rows.map(({ pendingAmountPaise, ...rest }) => ({ ...rest, pendingAmount: toRupees(pendingAmountPaise) }));
};

/**
 * One owner's individual pending-payout bookings — the drill-down behind
 * getPendingPayoutsSummary's per-owner totals, so the admin payouts screen
 * can settle (or inspect) one booking at a time without a separate
 * turf-by-turf query on the frontend.
 */
export const getPendingPayoutBookingsForOwner = async (ownerId) => {
  const turfs = await Turf.find({ ownerId }).select("_id");
  const turfIds = turfs.map((t) => t._id);
  return Booking.find({ turfId: { $in: turfIds }, payoutStatus: "PENDING" })
    .populate("turfId", "name location")
    .populate("userId", "name email")
    .sort({ createdAt: 1 });
};

/**
 * Bookings currently flagged CLAWBACK_OWED — refunded to the customer after
 * the owner had already been paid out for them. No automated recovery exists
 * (see booking.model.js's payoutStatus doc comment); this just surfaces the
 * list so an admin can reconcile with the owner manually.
 */
export const getClawbacksOwed = async () => {
  return Booking.find({ payoutStatus: "CLAWBACK_OWED" })
    .populate("turfId", "name location ownerId")
    .populate("userId", "name email")
    .sort({ paidOutAt: -1 });
};

/**
 * Paginated history of settled payouts, newest first.
 */
export const getPayoutHistory = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payout.find()
      .populate("ownerId", "name email")
      .populate("paidBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payout.countDocuments(),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
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
