import Review from "./review.model.js";
import Booking from "../booking/booking.model.js";
import Turf from "../turf/turf.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";

/**
 * Recompute a turf's denormalized rating summary from its actual reviews.
 * Run after every create/delete rather than incrementally averaged, since
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

/**
 * Create a review — gated on the reviewer actually having a CONFIRMED
 * booking for this turf, so ratings reflect real customers rather than
 * anyone with an account. One review per user per turf (the model's unique
 * index is the hard guarantee; this check gives a clean error instead of a
 * raw 11000).
 */
export const createReview = async (userId, turfId, { rating, comment }) => {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, "Rating must be an integer between 1 and 5");
  }

  const eligibleBooking = await Booking.findOne({ userId, turfId, status: "CONFIRMED" }).select("_id");
  if (!eligibleBooking) {
    throw new ApiError(403, "You can only review a turf you've booked and played at");
  }

  const alreadyReviewed = await Review.findOne({ userId, turfId }).select("_id");
  if (alreadyReviewed) {
    throw new ApiError(409, "You've already reviewed this turf");
  }

  const review = await Review.create({
    turfId,
    userId,
    bookingId: eligibleBooking._id,
    rating: numericRating,
    comment: (comment || "").trim(),
  });

  await recomputeTurfRating(turfId);

  logger.info("Review created", { turfId: String(turfId), reviewId: String(review._id) });
  return review;
};

export const getReviewsForTurf = async (turfId) => {
  return Review.find({ turfId }).populate("userId", "name").sort({ createdAt: -1 });
};

/** Whether the given user is eligible to review this turf right now. */
export const canReview = async (userId, turfId) => {
  const [hasBooking, alreadyReviewed] = await Promise.all([
    Booking.exists({ userId, turfId, status: "CONFIRMED" }),
    Review.exists({ userId, turfId }),
  ]);
  return Boolean(hasBooking) && !alreadyReviewed;
};
