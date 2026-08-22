import mongoose from "mongoose";

/**
 * Idempotency ledger for inbound Razorpay webhooks. Razorpay explicitly does
 * not guarantee exactly-once delivery — the same event can arrive more than
 * once. `dedupeKey` is a composite of the event type and the entity it acted
 * on (e.g. "payment.captured:pay_xxx"), which is stable across redeliveries
 * even though Razorpay's payload has no single global event id field on
 * every event type. The unique index is what actually enforces
 * once-only processing: two concurrent deliveries of the same event race to
 * insert, the loser gets a duplicate-key error and is treated as "already
 * handled" rather than reprocessed.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true },
    event: { type: String, required: true, index: true },
    razorpayEventId: { type: String, default: null },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    processedAt: { type: Date, default: Date.now },
    // The raw payload, kept for audit/replay/debugging. Razorpay webhook
    // bodies never contain card/UPI credentials (Standard Checkout keeps
    // those off this server entirely), so storing it verbatim is safe.
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
export default WebhookEvent;
