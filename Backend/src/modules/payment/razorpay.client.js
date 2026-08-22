import Razorpay from "razorpay";
import crypto from "crypto";
import env, { isRazorpayConfigured } from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";

let client = null;

/** Lazily constructed — importing this module must never crash a deployment
 * that hasn't configured Razorpay yet (e.g. cash-only owner bookings still
 * work with no payment gateway configured). */
export const getRazorpayClient = () => {
  if (!isRazorpayConfigured()) {
    throw new ApiError(503, "Online payments are not configured on this server");
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
};

/** Rupees → paise, the only unit Razorpay's API accepts. */
export const toPaise = (rupees) => Math.round(rupees * 100);
export const toRupees = (paise) => Math.round(paise) / 100;

/**
 * Server-side Razorpay Standard Checkout signature check (Phase 6):
 *   HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature
 * Uses a constant-time comparison — a naive `===` on attacker-influenced
 * hex strings is a timing side-channel, however small.
 */
export const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
};

/**
 * Webhook signature check (Phase 8): HMAC_SHA256(rawBody, webhook_secret).
 * Must run against the exact bytes Razorpay sent — the caller is responsible
 * for capturing the raw, unparsed body (see payment.routes.js, which mounts
 * express.raw() on this one route ahead of the global JSON parser).
 */
export const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!signatureHeader || !rawBody) return false;
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signatureHeader);
};

const safeEqual = (a, b) => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};
