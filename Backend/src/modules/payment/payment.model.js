import mongoose from "mongoose";

/**
 * One Payment document per checkout session (one Razorpay Order), covering
 * one or more slots on one turf for one user. Booking documents don't exist
 * yet when this is created — they're created only once the payment is
 * verified as PAID (see payment.service.js `finalizePaymentSuccess`), so this
 * is the only place slotIds/groupId live before that happens.
 *
 * A Razorpay order supports multiple payment attempts (retry after a failed
 * card, etc) without creating a new order — so this document is 1:1 with a
 * razorpayOrderId, and `attempts` records every razorpay_payment_id tried
 * against it, successful or not.
 */
const refundSchema = new mongoose.Schema(
  {
    razorpayRefundId: { type: String, required: true },
    amount: { type: Number, required: true }, // rupees
    status: {
      type: String,
      enum: ["CREATED", "PROCESSED", "FAILED"],
      default: "CREATED",
    },
    speed: { type: String, default: null },
    notes: { type: mongoose.Schema.Types.Mixed, default: null },
    initiatedBy: {
      type: String,
      enum: ["CUSTOMER_CANCELLATION", "OWNER_CANCELLATION", "ADMIN_CANCELLATION", "SYSTEM"],
      required: true,
    },
    failureReason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    razorpayPaymentId: { type: String, required: true },
    status: {
      type: String,
      enum: ["AUTHORIZED", "CAPTURED", "FAILED"],
      required: true,
    },
    method: { type: String, default: null },
    errorCode: { type: String, default: null },
    errorDescription: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      required: true,
      index: true,
    },
    slotIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Slot" }],
      required: true,
      validate: { validator: (v) => v.length > 0, message: "At least one slot is required" },
    },
    // One checkout session's identifier — reused across retry attempts on the
    // same order, and later shared by every Booking document this payment
    // produces (Booking.groupId), so the two can always be joined.
    groupId: {
      type: String,
      required: true,
      unique: true,
    },
    bookingIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
      default: [],
    },
    amount: {
      // Rupees, matching Booking.amount's unit — converted to paise only at
      // the Razorpay API boundary (payment.service.js), never stored in paise.
      type: Number,
      required: true,
      min: [1, "Amount must be positive"],
    },
    currency: { type: String, default: "INR" },
    receipt: { type: String, required: true, unique: true },

    status: {
      type: String,
      enum: [
        "CREATED", // internal record made, Razorpay order not yet created
        "ORDER_CREATED", // Razorpay order exists, awaiting checkout
        "AUTHORIZED", // payment.authorized received — NOT sufficient to confirm a booking
        "PAID", // captured + signature verified — the only state that may have created bookings
        "FAILED", // most recent attempt failed; order may still accept a retry
        "EXPIRED", // slot reservation lapsed before payment completed
        "PAID_BOOKING_FAILED", // captured, but the slot(s) could not be claimed — refund auto-initiated
      ],
      default: "CREATED",
      index: true,
    },

    // No `default: null` here, deliberately: a sparse index only excludes
    // documents where the field is *missing*, not documents where it's
    // present-but-null — and Mongoose's `default: null` would explicitly set
    // it on every document. With that default, the second Payment ever
    // created (by anyone) would collide with the first on `razorpayOrderId:
    // null` under the unique index. Leaving the field genuinely unset until
    // it's actually assigned a real order/payment id is what makes `sparse`
    // do what it looks like it does.
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String, default: null },

    attempts: { type: [attemptSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },

    failureCode: { type: String, default: null },
    failureReason: { type: String, default: null },

    paidAt: { type: Date, default: null },

    // Free-form, non-sensitive context (never card/UPI details — Razorpay
    // Standard Checkout means those never touch this server at all).
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });

/** Total refunded so far across all PROCESSED refund entries (rupees). */
paymentSchema.methods.refundedAmount = function () {
  return this.refunds.filter((r) => r.status === "PROCESSED").reduce((sum, r) => sum + r.amount, 0);
};

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
