import * as adminService from "./admin.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const getStats = async (_req, res) => {
  const stats = await adminService.getStats();
  new ApiResponse(200, "Stats fetched successfully", stats).send(res);
};

export const getAllTurfs = async (_req, res) => {
  const turfs = await adminService.getAllTurfsForAdmin();
  new ApiResponse(200, "Turfs fetched successfully", turfs).send(res);
};

export const approveTurf = async (req, res) => {
  const turf = await adminService.setTurfApproval(req.params.id, "APPROVED");
  new ApiResponse(200, "Turf approved", turf).send(res);
};

export const rejectTurf = async (req, res) => {
  const turf = await adminService.setTurfApproval(req.params.id, "REJECTED");
  new ApiResponse(200, "Turf rejected", turf).send(res);
};

export const getAllUsers = async (_req, res) => {
  const users = await adminService.getAllUsers();
  new ApiResponse(200, "Users fetched successfully", users).send(res);
};

export const setUserBanned = async (req, res) => {
  const user = await adminService.setUserBanned(req.params.id, !!req.body.isBanned);
  new ApiResponse(200, "User updated", user).send(res);
};
