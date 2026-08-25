import Review from "./review.model.js";
import Booking from "../booking/booking.model.js";

// Who may review: someone who held the booking through to its slot. CONFIRMED
// is included because the CONFIRMED → COMPLETED transition is lazy (see
// booking.service.js settleFinishedBookings), so a just-finished booking may
// not have been settled yet — the slotEndTime check is what actually enforces
// "has played". NO_SHOW is excluded: not turning up isn't grounds to rate the
// venue.
const PLAYED_STATUSES = ["CONFIRMED", "COMPLETED"];
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import { attachReviewImages, rearmImagesByUrl } from "../image/image.service.js";
import { buildPaginatedResult } from "../../common/utils/pagination.js";

/**
 * Recompute a turf's denormalized rating summary from its actual reviews.
 * Run after every create/edit rather than incrementally averaged, since
 * review volume per turf is small enough that a full aggregate is cheap and
 * this way there's no drift to worry about between the two documents.
 */
const recomputeTurfRating = async (turfId) => {
  const [agg] = await Review.aggregate([
    { $match: { turfId } },
    { $group: { _id: null, avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);

  await Turf.findByIdAndUpdate(turfId, {
    avgRating: agg ? Math.round(agg.avgRating * 10) / 10 : 0,
    reviewCount: agg ? agg.reviewCount : 0,
  });
};

const FACILITY_KEYS = ["turfQuality", "cleanliness", "staffBehavior"];

const parseFacilityRatings = (input) => {
  if (!input || typeof input !== "object") return undefined;
  const out = {};
  for (const key of FACILITY_KEYS) {
    const value = Number(input[key]);
    if (Number.isInteger(value) && value >= 1 && value <= 5) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Create a review — gated on the reviewer actually having a CONFIRMED
 * booking for this turf, so ratings reflect real customers rather than
 * anyone with an account. One review per user per turf (the model's unique
 * index is the hard guarantee; this check gives a clean error instead of a
 * raw 11000).
 */
export const createReview = async (userId, turfId, { rating, comment, facilityRatings, images }) => {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, "Rating must be an integer between 1 and 5");
  }

  // "Booked and played at" — both halves are enforced. Checking only that a
  // CONFIRMED booking exists let someone book a slot for next month and review
  // the turf immediately, which is a free rating-manipulation vector (book the
  // cheapest slot anywhere, review, cancel). The slot has to have actually
  // finished, so this joins through to the slot's endTime rather than trusting
  // booking status alone.
  const eligibleBooking = await Booking.findOne({
    userId,
    turfId,
    status: { $in: PLAYED_STATUSES },
    slotEndTime: { $lte: new Date() },
  }).select("_id");

  if (!eligibleBooking) {
    // Deliberately one message for both "never booked here" and "booked but
    // hasn't played yet": the distinction would tell an attacker probing the
    // endpoint which of the two states they're in, and neither permits a review.
    throw new ApiError(403, "You can only review a turf after you've played your booking");
  }

  const alreadyReviewed = await Review.findOne({ userId, turfId }).select("_id");
  if (alreadyReviewed) {
    throw new ApiError(409, "You've already reviewed this turf");
  }

  const claimedImages = images !== undefined ? await attachReviewImages(userId, images) : [];

  const review = await Review.create({
    turfId,
    userId,
    bookingId: eligibleBooking._id,
    rating: numericRating,
    comment: (comment || "").trim(),
    facilityRatings: parseFacilityRatings(facilityRatings),
    images: claimedImages,
  });

  await recomputeTurfRating(turfId);

  logger.info("Review created", { turfId: String(turfId), reviewId: String(review._id) });
  return review;
};

/** Edit your own review. Re-aggregates the turf's rating since the score can change. */
export const updateReview = async (userId, reviewId, { rating, comment, facilityRatings, images }) => {
  const review = await Review.findById(reviewId);
  if (!review) throw new ApiError(404, "Review not found");
  if (review.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "You can only edit your own review");
  }

  if (rating !== undefined) {
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new ApiError(400, "Rating must be an integer between 1 and 5");
    }
    review.rating = numericRating;
  }
  if (comment !== undefined) review.comment = String(comment).trim();
  if (facilityRatings !== undefined) review.facilityRatings = parseFacilityRatings(facilityRatings);

  if (images !== undefined) {
    const previousImages = review.images;
    review.images = await attachReviewImages(userId, images);
    const removed = previousImages.filter((url) => !review.images.includes(url));
    if (removed.length) await rearmImagesByUrl(removed);
  }

  await review.save();
  await recomputeTurfRating(review.turfId);

  logger.info("Review updated", { reviewId: String(reviewId) });
  return review;
};

/**
 * Flag a review for moderation. One report per user — resubmitting is a
 * no-op rather than an error, so a double-click doesn't need special-casing
 * on the frontend.
 */
export const reportReview = async (userId, reviewId) => {
  const review = await Review.findById(reviewId).select("_id");
  if (!review) throw new ApiError(404, "Review not found");

  await Review.findByIdAndUpdate(reviewId, { $addToSet: { reportedBy: userId } });
  logger.info("Review reported", { reviewId: String(reviewId), reporterId: String(userId) });
};

/** A turf owner responding publicly to a review left on their own turf. */
export const respondToReview = async (ownerId, reviewId, text) => {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new ApiError(400, "Response text is required");
  }

  const review = await Review.findById(reviewId).select("turfId");
  if (!review) throw new ApiError(404, "Review not found");

  const turf = await Turf.findById(review.turfId).select("ownerId");
  if (!turf || turf.ownerId.toString() !== ownerId.toString()) {
    throw new ApiError(403, "You can only respond to reviews on your own turf");
  }

  review.ownerResponse = { text: text.trim(), respondedAt: new Date() };
  await review.save();
  return review;
};

export const getReviewsForTurf = async (turfId, { page = 1, limit = 20 } = {}) => {
  const query = { turfId };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find(query).populate("userId", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Review.countDocuments(query),
  ]);
  return buildPaginatedResult(items, total, page, limit);
};

/**
 * Whether the given user is eligible to review this turf right now. Must stay
 * in step with createReview's own check — this is what decides whether the UI
 * offers the control, and the two disagreeing means offering a button that
 * then 403s.
 */
export const canReview = async (userId, turfId) => {
  const [hasPlayedBooking, alreadyReviewed] = await Promise.all([
    Booking.exists({
      userId,
      turfId,
      status: { $in: PLAYED_STATUSES },
      slotEndTime: { $lte: new Date() },
    }),
    Review.exists({ userId, turfId }),
  ]);
  return Boolean(hasPlayedBooking) && !alreadyReviewed;
};
