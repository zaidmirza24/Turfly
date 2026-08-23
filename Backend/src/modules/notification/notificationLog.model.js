import mongoose from "mongoose";

/**
 * Records every transactional notification the platform attempts to send.
 * Two jobs:
 *
 *  1. Idempotency — `dedupeKey` (unique) is built from the notification type
 *     plus the thing it's about (e.g. "BOOKING_CONFIRMED:<bookingId>"). Four
 *     duplicate webhook deliveries for the same underlying payment must still
 *     send exactly one "booking confirmed" email — the caller inserts this
 *     row *before* calling Brevo, and a duplicate-key error means "already
 *     sent, skip" rather than sending again.
 *  2. Observability — attempt count, last error, provider message id, so a
 *     support agent (or the admin panel) can answer "did the customer's
 *     confirmation email actually go out" without grepping logs.
 */
const notificationLogSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: [
        "BOOKING_CONFIRMED",
        "PAYMENT_SUCCESS",
        "PAYMENT_FAILED",
        "BOOKING_CANCELLED",
        "REFUND_INITIATED",
        "REFUND_COMPLETED",
        "BOOKING_REMINDER",
        "OWNER_NEW_BOOKING",
        "OWNER_BOOKING_CANCELLED",
        "PASSWORD_RESET",
      ],
      required: true,
      index: true,
    },
    recipientEmail: { type: String, required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    provider: { type: String, default: "BREVO" },
    providerMessageId: { type: String, default: null },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED", "DELIVERED", "BOUNCED"],
      default: "PENDING",
      index: true,
    },
    attemptCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const NotificationLog = mongoose.model("NotificationLog", notificationLogSchema);
export default NotificationLog;
