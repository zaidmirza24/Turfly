import * as adminService from "./admin.service.js";
import * as paymentService from "../payment/payment.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import ApiError from "../../common/utils/ApiError.js";

export const getStats = async (_req, res) => {
  const stats = await adminService.getStats();
  new ApiResponse(200, "Stats fetched successfully", stats).send(res);
};

export const getAllTurfs = async (req, res) => {
  const { page, limit, status, search } = req.query;
  const turfs = await adminService.getAllTurfsForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
    search,
  });
  new ApiResponse(200, "Turfs fetched successfully", turfs).send(res);
};

export const getTurfDetail = async (req, res) => {
  const detail = await adminService.getTurfDetailForAdmin(req.params.id);
  new ApiResponse(200, "Turf detail fetched successfully", detail).send(res);
};

export const approveTurf = async (req, res) => {
  const turf = await adminService.setTurfApproval(req.user._id, req.params.id, "APPROVED");
  new ApiResponse(200, "Turf approved", turf).send(res);
};

export const rejectTurf = async (req, res) => {
  const turf = await adminService.setTurfApproval(req.user._id, req.params.id, "REJECTED");
  new ApiResponse(200, "Turf rejected", turf).send(res);
};

export const getAllUsers = async (req, res) => {
  const { page, limit, search, role } = req.query;
  const users = await adminService.getAllUsers({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search,
    role,
  });
  new ApiResponse(200, "Users fetched successfully", users).send(res);
};

export const setUserBanned = async (req, res) => {
  const user = await adminService.setUserBanned(req.user._id, req.params.id, !!req.body.isBanned);
  new ApiResponse(200, "User updated", user).send(res);
};

export const getAllBookings = async (req, res) => {
  const { page, limit, from, to, turfId, status, paymentStatus, refundStatus, payoutStatus } = req.query;
  const bookings = await adminService.getAllBookingsForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    from,
    to,
    turfId,
    status,
    paymentStatus,
    refundStatus,
    payoutStatus,
  });
  new ApiResponse(200, "Bookings fetched successfully", bookings).send(res);
};

export const getPendingPayouts = async (_req, res) => {
  const payouts = await adminService.getPendingPayoutsSummary();
  new ApiResponse(200, "Pending payouts fetched successfully", payouts).send(res);
};

export const getPendingPayoutBookingsForOwner = async (req, res) => {
  const bookings = await adminService.getPendingPayoutBookingsForOwner(req.params.ownerId);
  new ApiResponse(200, "Pending payout bookings fetched successfully", bookings).send(res);
};

export const getClawbacksOwed = async (_req, res) => {
  const bookings = await adminService.getClawbacksOwed();
  new ApiResponse(200, "Clawbacks fetched successfully", bookings).send(res);
};

export const getPayoutHistory = async (req, res) => {
  const { page, limit } = req.query;
  const history = await adminService.getPayoutHistory({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Payout history fetched successfully", history).send(res);
};

export const getAllCustomers = async (req, res) => {
  const { page, limit } = req.query;
  const customers = await adminService.getAllCustomersForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Customers fetched successfully", customers).send(res);
};

export const getCustomerDetail = async (req, res) => {
  const detail = await adminService.getCustomerDetailForAdmin(req.params.userId);
  new ApiResponse(200, "Customer detail fetched successfully", detail).send(res);
};

/**
 * Payments captured (real money taken) whose booking creation never
 * finished — see payment.service.js's findStuckPayments for the crash
 * window this covers. Not a scheduled job (see ai-context.md's "recurring
 * work without a scheduler") — this is the human-triggered surface for
 * something that, unlike everything else in this codebase, genuinely
 * cannot be derived from a request that's already happening: nobody's
 * browser is polling for a payment its own tab already thinks is fine.
 */
export const getStuckPayments = async (_req, res) => {
  const payments = await paymentService.findStuckPayments();
  new ApiResponse(200, "Stuck payments fetched successfully", payments).send(res);
};

export const reconcileStuckPayment = async (req, res) => {
  const result = await paymentService.reconcileStuckPayment(req.params.id);
  await adminService.logAdminAction(req.user._id, "PAYMENT_RECONCILED", "PAYMENT", req.params.id, {
    recoveredCount: result.recovered?.length ?? 0,
    bookingFailed: !!result.bookingFailed,
    alreadyComplete: !!result.alreadyComplete,
  });
  new ApiResponse(200, "Payment reconciled", result).send(res);
};

export const getAuditLog = async (req, res) => {
  const { page, limit } = req.query;
  const log = await adminService.getAuditLog({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Audit log fetched successfully", log).send(res);
};
