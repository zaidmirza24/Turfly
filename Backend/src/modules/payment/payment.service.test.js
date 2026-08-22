import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.model.js", () => ({
  default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("./webhookEvent.model.js", () => ({ default: { create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("../booking/booking.model.js", () => ({
  default: { find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("../slot/slot.model.js", () => ({ default: { updateMany: vi.fn() } }));
vi.mock("../turf/turf.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../user/user.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../booking/booking.service.js", () => ({
  validateSlotSelection: vi.fn(),
  confirmSlot: vi.fn(),
  forceCancelForSystem: vi.fn(),
}));
vi.mock("./razorpay.client.js", () => ({
  getRazorpayClient: vi.fn(),
  toPaise: (r) => Math.round(r * 100),
  toRupees: (p) => Math.round(p) / 100,
  verifyPaymentSignature: vi.fn(),
}));
vi.mock("../../common/config/env.js", () => ({
  default: { RAZORPAY_KEY_ID: "key", PAYMENT_RESERVATION_MINUTES: 10 },
  isRazorpayConfigured: () => true,
}));
vi.mock("../notification/email.service.js", () => ({
  sendBookingConfirmed: vi.fn().mockResolvedValue(null),
  sendPaymentSuccess: vi.fn().mockResolvedValue(null),
  sendOwnerNewBooking: vi.fn().mockResolvedValue(null),
  sendPaymentSucceededBookingFailed: vi.fn().mockResolvedValue(null),
}));

const Payment = (await import("./payment.model.js")).default;
const Booking = (await import("../booking/booking.model.js")).default;
const { confirmSlot, forceCancelForSystem } = await import("../booking/booking.service.js");
const { verifyPaymentSignature } = await import("./razorpay.client.js");
const { finalizePaymentSuccess, verifyAndFinalizePayment, buildDedupeKey } = await import("./payment.service.js");

describe("buildDedupeKey (Phase 8/9 — webhook idempotency)", () => {
  it("is stable and unique per event type + entity id", () => {
    expect(buildDedupeKey("payment.captured", "pay_1")).toBe("payment.captured:pay_1");
    expect(buildDedupeKey("payment.captured", "pay_1")).toBe(buildDedupeKey("payment.captured", "pay_1"));
    expect(buildDedupeKey("payment.captured", "pay_2")).not.toBe(buildDedupeKey("payment.captured", "pay_1"));
    expect(buildDedupeKey("refund.processed", "pay_1")).not.toBe(buildDedupeKey("payment.captured", "pay_1"));
  });
});

describe("verifyAndFinalizePayment (Phase 6 — signature must be built from OUR stored order id)", () => {
  beforeEach(() => vi.clearAllMocks());

  const storedPayment = {
    _id: "pay_doc_2",
    userId: "user_1",
    status: "ORDER_CREATED",
    razorpayOrderId: "order_REAL",
  };

  it("rejects before ever computing an HMAC if the client's claimed order id disagrees with our record", async () => {
    Payment.findById.mockResolvedValue(storedPayment);

    await expect(
      verifyAndFinalizePayment("user_1", {
        paymentId: "507f1f77bcf86cd799439011",
        razorpayOrderId: "order_ATTACKER_SUPPLIED",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "sig",
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(verifyPaymentSignature).not.toHaveBeenCalled();
  });

  it("verifies the HMAC using OUR stored razorpayOrderId, never the value the client sent back", async () => {
    Payment.findById.mockResolvedValue(storedPayment);
    verifyPaymentSignature.mockReturnValue(false); // reject deliberately so the test only needs to inspect the call args

    await expect(
      verifyAndFinalizePayment("user_1", {
        paymentId: "507f1f77bcf86cd799439011",
        razorpayOrderId: "order_REAL",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "sig",
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(verifyPaymentSignature).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: storedPayment.razorpayOrderId })
    );
  });
});

describe("finalizePaymentSuccess (Phase 6/9/10 — the one authoritative confirm path)", () => {
  beforeEach(() => vi.clearAllMocks());

  const paymentDoc = { _id: "pay_doc_1", razorpayOrderId: "order_1", userId: "user_1", slotIds: ["slot_1"], groupId: "group_1" };

  it("rejects when the order id doesn't match our own stored record (order-id tampering)", async () => {
    await expect(
      finalizePaymentSuccess({
        paymentDoc,
        razorpayOrderId: "order_FORGED",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "sig",
        source: "CALLBACK",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op (deduped) when the atomic claim loses the race — a concurrent caller already finalized it", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(null); // atomic claim failed: already PAID by someone else
    Payment.findById.mockResolvedValue({ _id: "pay_doc_1", bookingIds: ["b1"] });
    Booking.find.mockResolvedValue([{ _id: "b1" }]);

    const result = await finalizePaymentSuccess({
      paymentDoc,
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_1",
      razorpaySignature: "sig",
      source: "WEBHOOK",
    });

    expect(result.deduped).toBe(true);
    expect(confirmSlot).not.toHaveBeenCalled();
  });

  it("rolls back and auto-refunds when the slot can no longer be claimed after a captured payment", async () => {
    Payment.findOneAndUpdate.mockResolvedValue({
      ...paymentDoc,
      status: "PAID",
      amount: 500,
      razorpayPaymentId: "pay_1",
      refunds: [],
      refundedAmount: () => 0,
    });
    confirmSlot.mockRejectedValue(new Error("Slot lock expired or was not locked by you"));
    Payment.findById.mockResolvedValue({
      _id: "pay_doc_1",
      status: "PAID_BOOKING_FAILED",
      amount: 500,
      razorpayPaymentId: "pay_1",
      refunds: [],
      refundedAmount: () => 0,
    });
    Payment.findByIdAndUpdate = vi.fn().mockResolvedValue(null);

    const { getRazorpayClient } = await import("./razorpay.client.js");
    getRazorpayClient.mockReturnValue({
      payments: { refund: vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed" }) },
    });

    const result = await finalizePaymentSuccess({
      paymentDoc,
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_1",
      razorpaySignature: "sig",
      source: "CALLBACK",
    });

    expect(result.bookingFailed).toBe(true);
    expect(forceCancelForSystem).not.toHaveBeenCalled(); // no bookings were created before the failure this time
    expect(getRazorpayClient().payments.refund).toHaveBeenCalledWith(
      "pay_1",
      expect.objectContaining({ amount: 50000 })
    );
  });
});
