import * as complaintService from "./complaint.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const createComplaint = async (req, res) => {
  const complaint = await complaintService.createComplaint(req.user, req.body);
  new ApiResponse(201, "Complaint submitted", complaint).send(res);
};

export const getMyComplaints = async (req, res) => {
  const complaints = await complaintService.getMyComplaints(req.user._id);
  new ApiResponse(200, "Complaints fetched successfully", complaints).send(res);
};

export const getAllComplaints = async (req, res) => {
  const { page, limit, status } = req.query;
  const complaints = await complaintService.getAllComplaintsForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
  });
  new ApiResponse(200, "Complaints fetched successfully", complaints).send(res);
};

export const getComplaintDetail = async (req, res) => {
  const complaint = await complaintService.getComplaintDetail(req.params.id);
  new ApiResponse(200, "Complaint detail fetched successfully", complaint).send(res);
};

export const resolveComplaint = async (req, res) => {
  const complaint = await complaintService.resolveComplaint(req.user._id, req.params.id, req.body);
  new ApiResponse(200, "Complaint updated", complaint).send(res);
};
