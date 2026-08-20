import * as turfService from "./turf.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const createTurf = async (req, res) => {
  const turf = await turfService.createTurf(req.user._id, req.body);
  new ApiResponse(201, "Turf created successfully", turf).send(res);
};

export const getAllTurfs = async (req, res) => {
  const { limit, ...filter } = req.query;
  // If not filtering by owner, only show live, admin-approved turfs
  if (!filter.ownerId) {
    filter.isActive = true;
    filter.approvalStatus = "APPROVED";
  }

  const turfs = await turfService.getAllTurfs(filter, { limit });
  new ApiResponse(200, "Turfs fetched successfully", turfs).send(res);
};

export const getTurfById = async (req, res) => {
  const turf = await turfService.getTurfById(req.params.id);
  new ApiResponse(200, "Turf fetched successfully", turf).send(res);
};

export const updateTurf = async (req, res) => {
  const turf = await turfService.updateTurf(req.params.id, req.user._id, req.body);
  new ApiResponse(200, "Turf updated successfully", turf).send(res);
};
