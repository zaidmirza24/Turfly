import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      required: [true, "Turf reference is required"],
      // Queried on every owner bookings view (getBookingsByTurf / getOwnerBookings).
      index: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Slot",
      required: [true, "Slot reference is required"],
    },
    status: {
      type: String,
      enum: ["CONFIRMED", "CANCELLED"],
      default: "CONFIRMED",
    },
    amount: {
      type: Number,
      required: [true, "Booking amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    // Links bookings created together in one multi-slot checkout. Each slot
    // still gets its own Booking document (existing single-slot code paths —
    // cancellation, owner views — need no changes), groupId just lets the
    // frontend show/cancel them as one logical booking. null for a normal
    // single-slot booking.
    groupId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt serves as booking time
  }
);

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
