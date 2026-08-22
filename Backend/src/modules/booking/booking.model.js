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
    // Who cancelled this booking, distinct from just knowing that it's
    // cancelled — needed for refund policy and reporting once real payments
    // exist. Only CUSTOMER is reachable today (there is no admin/owner
    // cancellation endpoint yet); the other values are here so a future
    // admin-cancel flow doesn't need a schema migration.
    cancelledBy: {
      type: String,
      enum: ["CUSTOMER", "OWNER", "ADMIN", "SYSTEM"],
      default: null,
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
    // The owner's own bookkeeping note that they refunded this booking
    // outside the app (cash handback, UPI transfer, etc). No payment gateway
    // exists, so nothing here ever moves real money — this is a status label,
    // not a refund transaction. Only settable once status is CANCELLED.
    // MARKED_REFUNDED is the pre-existing owner bookkeeping note for CASH/
    // PENDING bookings (no real money ever moved). The rest track a real
    // Razorpay refund lifecycle for ONLINE bookings (payment.service.js):
    // REFUND_PENDING is set the moment a refund is accepted by Razorpay,
    // REFUNDED only once the `refund.processed` webhook confirms it landed.
    refundStatus: {
      type: String,
      enum: ["NONE", "MARKED_REFUNDED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"],
      default: "NONE",
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Set once a real online payment confirms this booking (payment.service.js
    // finalizePaymentSuccess). null for CASH/manual owner bookings, which have
    // no payment gateway record.
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    // Free-text note — a cancellation reason, or context an owner attaches to
    // a manually-created booking.
    notes: {
      type: String,
      default: null,
      maxlength: 500,
    },
    // Whether the customer self-booked (normal flow) or an owner entered this
    // on their behalf (phone/walk-in booking created from the owner panel).
    createdBy: {
      type: String,
      enum: ["CUSTOMER", "OWNER"],
      default: "CUSTOMER",
    },
    // How the owner recorded payment for a manually-created booking. ONLINE
    // is the default for customer self-service bookings (today's simulated
    // checkout); CASH/PENDING are only ever set by the owner on a manual
    // booking — there is no real payment collection behind either.
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "CASH", "PENDING"],
      default: "ONLINE",
    },
  },
  {
    timestamps: true, // createdAt serves as booking time
  }
);

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
