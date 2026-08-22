import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

vi.mock("../../common/config/env.js", () => ({
  default: { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "test_secret", RAZORPAY_WEBHOOK_SECRET: "webhook_secret" },
  isRazorpayConfigured: () => true,
}));

const { verifyPaymentSignature, verifyWebhookSignature, toPaise, toRupees } = await import("./razorpay.client.js");

describe("toPaise / toRupees", () => {
  it("converts rupees to paise", () => {
    expect(toPaise(500)).toBe(50000);
    expect(toPaise(499.5)).toBe(49950);
  });
  it("rounds to the nearest paise to avoid float drift", () => {
    expect(toPaise(10.005)).toBe(1001); // 10.005 * 100 = 1000.4999... floats
  });
  it("round-trips paise back to rupees", () => {
    expect(toRupees(50000)).toBe(500);
  });
});

describe("verifyPaymentSignature (Phase 6 — Razorpay Standard Checkout)", () => {
  const secret = "test_secret";
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";

  const validSignature = () => crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  it("accepts a correctly computed signature", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature: validSignature() })).toBe(true);
  });

  it("rejects a tampered signature", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature: "0".repeat(64) })).toBe(false);
  });

  it("rejects when the payment id doesn't match what was signed (amount/id tampering)", () => {
    const sigForDifferentPayment = crypto.createHmac("sha256", secret).update(`${orderId}|pay_OTHER`).digest("hex");
    expect(verifyPaymentSignature({ orderId, paymentId, signature: sigForDifferentPayment })).toBe(false);
  });

  it("rejects missing fields rather than throwing", () => {
    expect(verifyPaymentSignature({ orderId, paymentId: "", signature: "x" })).toBe(false);
    expect(verifyPaymentSignature({})).toBe(false);
  });
});

describe("verifyWebhookSignature (Phase 8)", () => {
  const secret = "webhook_secret";
  const rawBody = JSON.stringify({ event: "payment.captured" });
  const validSignature = () => crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  it("accepts a signature computed over the exact raw bytes", () => {
    expect(verifyWebhookSignature(rawBody, validSignature())).toBe(true);
  });

  it("rejects if the body was re-serialized/mutated before verification", () => {
    const mutatedBody = JSON.stringify({ event: "payment.captured" }, null, 2); // different whitespace
    expect(verifyWebhookSignature(mutatedBody, validSignature())).toBe(false);
  });

  it("rejects a forged signature", () => {
    expect(verifyWebhookSignature(rawBody, "deadbeef".repeat(8))).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature(rawBody, "")).toBe(false);
  });
});
