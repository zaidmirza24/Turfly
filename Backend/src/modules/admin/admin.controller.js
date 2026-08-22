import * as adminService from "./admin.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

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
  const { page, limit, from, to, turfId, status, paymentStatus, refundStatus } = req.query;
  const bookings = await adminService.getAllBookingsForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    from,
    to,
    turfId,
    status,
    paymentStatus,
    refundStatus,
  });
  new ApiResponse(200, "Bookings fetched successfully", bookings).send(res);
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

export const getAuditLog = async (req, res) => {
  const { page, limit } = req.query;
  const log = await adminService.getAuditLog({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  new ApiResponse(200, "Audit log fetched successfully", log).send(res);
};
