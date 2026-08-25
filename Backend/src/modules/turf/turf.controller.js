import * as turfService from "./turf.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import { toPaise } from "../../common/utils/money.js";
import { parsePagination } from "../../common/utils/pagination.js";

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
const VALID_SORTS = new Set(["newest", "price_asc", "price_desc", "rating", "popularity"]);
const VALID_VENUE_TYPES = new Set(["INDOOR", "OUTDOOR", "BOTH"]);

const buildPublicTurfFilter = (query) => {
  const filter = {};

  if (query.sportsType !== undefined) {
    const sports = String(query.sportsType).split(",").map((s) => s.trim()).filter(Boolean);
    if (sports.length === 1) filter.sportsType = sports[0];
    else if (sports.length > 1) filter.sportsType = { $in: sports };
  }

  if (query.location !== undefined) {
    // Reduced to a plain alphanumeric term before it becomes a RegExp, so a
    // caller can't smuggle in regex metacharacters (catastrophic-backtracking
    // patterns included).
    const term = String(query.location).replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
    if (term) filter.location = new RegExp(term, "i");
  }

  if (query.venueType !== undefined && VALID_VENUE_TYPES.has(String(query.venueType).toUpperCase())) {
    filter.venueType = String(query.venueType).toUpperCase();
  }

  const minPrice = Number(query.minPrice);
  const maxPrice = Number(query.maxPrice);
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    filter.pricePerHourPaise = {};
    if (Number.isFinite(minPrice)) filter.pricePerHourPaise.$gte = toPaise(minPrice);
    if (Number.isFinite(maxPrice)) filter.pricePerHourPaise.$lte = toPaise(maxPrice);
  }

  if (query.amenities !== undefined) {
    const list = String(query.amenities).split(",").map((a) => a.trim()).filter(Boolean);
    if (list.length) filter.amenities = { $all: list };
  }

  const minRating = Number(query.minRating);
  if (Number.isFinite(minRating)) {
    filter.avgRating = { $gte: minRating };
  }

  // The public listing only ever shows live, admin-approved turfs.
  filter.isActive = true;
  filter.approvalStatus = "APPROVED";

  return filter;
};

const buildPublicTurfOptions = (query) => {
  const options = { limit: query.limit };

  // `page` is opt-in (see turf.service.js getAllTurfs) — only present it once
  // the caller has actually asked to page through results, so "give me the
  // top N" callers (HomePage widgets, name autocomplete) keep getting a plain
  // array back untouched.
  if (query.page !== undefined) {
    const parsed = parsePagination(query, { maxLimit: 60 });
    options.page = parsed.page;
    options.limit = parsed.limit;
  }

  if (VALID_SORTS.has(query.sortBy)) options.sortBy = query.sortBy;
  if (query.availableNow === "true") options.availableNow = true;

  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    options.near = { lat, lng };
    options.sortBy = undefined; // $geoNear already sorts by distance

    const maxDistanceKm = Number(query.maxDistanceKm);
    if (Number.isFinite(maxDistanceKm) && maxDistanceKm > 0) {
      options.near.maxDistanceKm = maxDistanceKm;
    }
  }

  return options;
};

// Owner accounts are not vetted. Anyone can register as an owner and list a
// turf immediately — the listing itself is what an admin reviews, and it stays
// invisible to customers until it's APPROVED (turf.service.js createTurf sets
// PENDING; getTurfById and the public listing both filter on it). One review
// gate, on the thing customers actually see, rather than two.
export const createTurf = async (req, res) => {
  const turf = await turfService.createTurf(req.user._id, req.body);
  new ApiResponse(201, "Turf created successfully", turf).send(res);
};

export const getAllTurfs = async (req, res) => {
  const turfs = await turfService.getAllTurfs(
    buildPublicTurfFilter(req.query),
    buildPublicTurfOptions(req.query)
  );
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
