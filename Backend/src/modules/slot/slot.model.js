import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      required: [true, "Turf reference is required"],
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "LOCKED", "BOOKED", "CLOSED", "FULL"],
      // CLOSED = owner blocked this hour off (maintenance, outside operating hours)
      // FULL   = owner manually marked it taken (walk-in/cash customer, no in-app booking)
      // Both CLOSED and FULL are excluded from lockSlot's AVAILABLE match, so
      // they're non-bookable without any change to booking.service.js.
      default: "AVAILABLE",
      index: true,
    },

    // ── Future-proofing fields (NOT used in Phase 1) ──
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
    },
    // ──────────────────────────────────────────────────

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient slot queries by turf + time range
slotSchema.index({ turfId: 1, startTime: 1 });

const Slot = mongoose.model("Slot", slotSchema);
export default Slot;
