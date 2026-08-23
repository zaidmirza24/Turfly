import Complaint from "./complaint.model.js";
import ApiError from "../../common/utils/ApiError.js";
import { logAdminAction } from "../admin/admin.service.js";

const VALID_CATEGORIES = ["PAYMENT", "BOOKING", "TURF_QUALITY", "BEHAVIOR", "OTHER"];
const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];

export const createComplaint = async (user, { bookingId, turfId, category, description }) => {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!description || !description.trim()) {
    throw new ApiError(400, "Description is required");
  }

  return Complaint.create({
    raisedBy: user._id,
    raisedByRole: user.role,
    bookingId: bookingId || null,
    turfId: turfId || null,
    category,
    description: description.trim(),
  });
};

export const getMyComplaints = async (userId) => {
  return Complaint.find({ raisedBy: userId })
    .populate("bookingId", "amount createdAt")
    .populate("turfId", "name location")
    .sort({ createdAt: -1 });
};

export const getAllComplaintsForAdmin = async ({ page = 1, limit = 20, status } = {}) => {
  const query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Complaint.find(query)
      .populate("raisedBy", "name email")
      .populate("bookingId", "amount createdAt")
      .populate("turfId", "name location")
      .populate("resolvedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Complaint.countDocuments(query),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
};

export const getComplaintDetail = async (id) => {
  const complaint = await Complaint.findById(id)
    .populate("raisedBy", "name email phone")
    .populate("bookingId", "amount createdAt status")
    .populate("turfId", "name location")
    .populate("resolvedBy", "name email");
  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }
  return complaint;
};

export const resolveComplaint = async (adminId, id, { status, resolutionNote }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  const complaint = await Complaint.findById(id);
  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  complaint.status = status;
  complaint.resolutionNote = resolutionNote || null;
  if (["RESOLVED", "DISMISSED"].includes(status)) {
    complaint.resolvedBy = adminId;
    complaint.resolvedAt = new Date();
  } else {
    complaint.resolvedBy = null;
    complaint.resolvedAt = null;
  }
  await complaint.save();

  await logAdminAction(adminId, "COMPLAINT_RESOLVED", "COMPLAINT", complaint._id, { status });
  return complaint;
};
