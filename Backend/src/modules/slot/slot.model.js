import mongoose from "mongoose";
import { toRupees } from "../../common/utils/money.js";

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
    pricePaise: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: { validator: Number.isInteger, message: "pricePaise must be an integer" },
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
    // The price snapshotted at the moment this slot was locked. Booking
    // confirmation charges this, not whatever `price` happens to be at
    // confirm time — otherwise a price change made by the owner mid-hold
    // (e.g. a bulk weekday/weekend repricing) would silently change what a
    // customer who already saw and accepted a price ends up paying.
    lockedPricePaise: {
      type: Number,
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

// Unique compound index: one slot per turf per hour. Also enforces the
// idempotency default-slot provisioning (slot.service.js) relies on — two
// concurrent requests provisioning the same hour race safely instead of
// creating duplicate slot documents for it.
slotSchema.index({ turfId: 1, startTime: 1 }, { unique: true });

const moneyToJSON = (_doc, ret) => {
  ret.price = toRupees(ret.pricePaise);
  delete ret.pricePaise;
  ret.lockedPrice = ret.lockedPricePaise != null ? toRupees(ret.lockedPricePaise) : null;
  delete ret.lockedPricePaise;
  return ret;
};
slotSchema.set("toJSON", { transform: moneyToJSON });
slotSchema.set("toObject", { transform: moneyToJSON });

const Slot = mongoose.model("Slot", slotSchema);
export default Slot;
