import * as turfService from "./turf.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

/**
 * Build a Mongo filter from user-supplied query params.
 *
 * Deliberately a whitelist that coerces every value to a primitive, rather
 * than spreading `req.query` into the filter. Express parses `?a[$ne]=x`
 * into a nested object, so a passthrough spread lets any caller inject Mongo
 * operators — and, more concretely here, lets them ask for turfs the public
 * listing is supposed to hide (`?approvalStatus=PENDING`, `?isActive=false`,
 * `?ownerId=<someone-else>`).
 */
const buildPublicTurfFilter = (query) => {
  const filter = {};

  if (query.sportsType !== undefined) {
    filter.sportsType = String(query.sportsType);
  }

  if (query.location !== undefined) {
    // Reduced to a plain alphanumeric term before it becomes a RegExp, so a
    // caller can't smuggle in regex metacharacters (catastrophic-backtracking
    // patterns included).
    const term = String(query.location).replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
    if (term) filter.location = new RegExp(term, "i");
  }

  // The public listing only ever shows live, admin-approved turfs.
  filter.isActive = true;
  filter.approvalStatus = "APPROVED";

  return filter;
};

export const createTurf = async (req, res) => {
  const turf = await turfService.createTurf(req.user._id, req.body);
  new ApiResponse(201, "Turf created successfully", turf).send(res);
};

export const getAllTurfs = async (req, res) => {
  const turfs = await turfService.getAllTurfs(buildPublicTurfFilter(req.query), {
    limit: req.query.limit,
  });
  new ApiResponse(200, "Turfs fetched successfully", turfs).send(res);
};

/**
 * The owner's own turfs — any approval status. The owner id comes from the
 * verified JWT, never from the query string.
 */
export const getMyTurfs = async (req, res) => {
  const turfs = await turfService.getAllTurfs(
    { ownerId: req.user._id },
    { limit: req.query.limit }
  );
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
