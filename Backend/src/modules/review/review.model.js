import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, "Review cannot exceed 500 characters"],
      default: "",
    },
    // Optional per-facility breakdown — all-or-nothing isn't required because
    // a reviewer may only have an opinion on some of these.
    facilityRatings: {
      turfQuality: { type: Number, min: 1, max: 5 },
      cleanliness: { type: Number, min: 1, max: 5 },
      staffBehavior: { type: Number, min: 1, max: 5 },
    },
    images: {
      type: [String],
      default: [],
    },
    ownerResponse: {
      text: { type: String, trim: true, maxlength: 500 },
      respondedAt: { type: Date },
    },
    // Users who've reported this review — a Set-like array (not just a
    // count) so the same user can't inflate it by reporting twice, and so a
    // future moderation view can show who flagged it.
    reportedBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true }
);

// One review per user per turf — reviewService re-checks this atomically at
// write time, but the index is what actually prevents a duplicate under a
// race between two requests from the same user.
reviewSchema.index({ turfId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
