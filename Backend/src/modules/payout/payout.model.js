import mongoose from "mongoose";

/**
 * A record of the platform actually sending an owner their share of one or
 * more bookings' takings. This never moves money itself — the transfer
 * happens outside the app (UPI/bank transfer) — it's the admin's bookkeeping
 * entry for "I sent this owner this amount, here's what it covers", created
 * by booking.service.js's markBookingPaidOut. Bookings settled by this record
 * have their own payoutStatus flipped to PAID and payoutId set to this doc's
 * _id (see booking.model.js), so a Payout and its Bookings can always be
 * cross-referenced either direction.
 */
const payoutSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
      required: true,
      validate: { validator: (v) => v.length > 0, message: "At least one booking is required" },
    },
    amount: {
      // Rupees — the sum of the settled bookings' ownerAmount at the time of
      // payout, not recomputed later.
      type: Number,
      required: true,
      min: [1, "Amount must be positive"],
    },
    method: {
      type: String,
      enum: ["UPI", "BANK_TRANSFER", "OTHER"],
      required: true,
    },
    // Free-text reference the admin attaches — a UTR/transaction id, a note
    // on how the transfer was made. Not validated against anything real since
    // the transfer itself happens outside this system.
    note: {
      type: String,
      default: null,
      maxlength: 500,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

payoutSchema.index({ ownerId: 1, createdAt: -1 });

const Payout = mongoose.model("Payout", payoutSchema);
export default Payout;
