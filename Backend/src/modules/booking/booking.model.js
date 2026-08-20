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
  },
  {
    timestamps: true, // createdAt serves as booking time
  }
);

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
