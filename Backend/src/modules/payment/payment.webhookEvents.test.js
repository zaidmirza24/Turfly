import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.model.js", () => ({
  default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), findOne: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("./webhookEvent.model.js", () => ({ default: { create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("../booking/booking.model.js", () => ({
  default: { find: vi.fn(), findByIdAndUpdate: vi.fn(), findOneAndUpdate: vi.fn() },
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
  sendPaymentFailure: vi.fn().mockResolvedValue(null),
  sendRefundInitiated: vi.fn().mockResolvedValue(null),
  sendRefundCompleted: vi.fn().mockResolvedValue(null),
}));

const Payment = (await import("./payment.model.js")).default;
const Booking = (await import("../booking/booking.model.js")).default;
const { getRazorpayClient } = await import("./razorpay.client.js");
const {
  handleWebhookEvent,
} = await import("./payment.service.js");

const webhookPayload = (event, entityKey, entity) => ({
  event,
  payload: { [entityKey]: { entity } },
});

describe("handleWebhookEvent (Section 4/8 — one already-deduped event)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TC-4.7-adjacent — payment.authorized only moves CREATED/ORDER_CREATED payments, never re-authorizes a PAID one", async () => {
    Payment.findOneAndUpdate.mockResolvedValue({});
    await handleWebhookEvent(
      "payment.authorized",
      webhookPayload("payment.authorized", "payment", { id: "pay_1", order_id: "order_1", method: "card" })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { razorpayOrderId: "order_1", status: { $in: ["CREATED", "ORDER_CREATED"] } },
      expect.objectContaining({ status: "AUTHORIZED" })
    );
  });

  it("payment.captured for an unknown order id is logged and skipped, not thrown", async () => {
    Payment.findOne.mockResolvedValue(null);
    await expect(
      handleWebhookEvent(
        "payment.captured",
        webhookPayload("payment.captured", "payment", { id: "pay_ghost", order_id: "order_ghost" })
      )
    ).resolves.toBeUndefined();
  });

  it("TC-2.1/4.5-adjacent — payment.failed never downgrades an already-PAID payment (query excludes status PAID)", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(null); // simulates the $ne: "PAID" guard excluding it
    await handleWebhookEvent(
      "payment.failed",
      webhookPayload("payment.failed", "payment", {
        id: "pay_1",
        order_id: "order_1",
        error_code: "GATEWAY_ERROR",
        error_description: "card declined",
      })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { razorpayOrderId: "order_1", status: { $ne: "PAID" } },
      expect.objectContaining({ status: "FAILED" }),
      { new: true }
    );
  });

  it("TC-4.8 — refund webhook for an unknown razorpayPaymentId is skipped safely", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(null); // no doc matches at any of upsertRefundEntry's three attempts
    await expect(
      handleWebhookEvent(
        "refund.processed",
        webhookPayload("refund.processed", "refund", { id: "rfnd_1", payment_id: "pay_ghost", amount: 50000 })
      )
    ).resolves.toBeUndefined();
  });

  it("TC-4.12 — refund.processed on a fresh refund entry appends it as PROCESSED and marks the matching booking REFUNDED", async () => {
    // upsertRefundEntry now does this atomically (Payment.findOneAndUpdate),
    // not a load-then-.save() round trip: case 1 (update an existing entry)
    // finds nothing, case 2 ($push a new one) succeeds and returns the
    // updated document — see payment.service.js.
    const pushedDoc = {
      _id: "pay_doc_1",
      amountPaise: 50000,
      refunds: [{ razorpayRefundId: "rfnd_1", status: "PROCESSED", amountPaise: 50000, notes: { bookingId: "b1" } }],
      refundedAmount: () => 50000,
    };
    Payment.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(pushedDoc);
    const bookingDoc = { _id: "b1", status: "CANCELLED", refundStatus: "REFUND_PENDING", payoutStatus: "PENDING", save: vi.fn().mockResolvedValue(true) };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent(
      "refund.processed",
      webhookPayload("refund.processed", "refund", { id: "rfnd_1", payment_id: "pay_real", amount: 50000 })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(Payment.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { razorpayPaymentId: "pay_real", "refunds.razorpayRefundId": { $ne: "rfnd_1" } },
      expect.objectContaining({ $push: { refunds: expect.objectContaining({ razorpayRefundId: "rfnd_1", amountPaise: 50000, status: "PROCESSED" }) } }),
      { new: true }
    );
    expect(bookingDoc.refundStatus).toBe("REFUNDED");
    expect(bookingDoc.save).toHaveBeenCalled();
  });

  it("TC-4.10/4.12 — a duplicate refund.processed delivery for a refund id already recorded updates in place, not a second entry", async () => {
    // Case 1 (update-in-place) matches immediately every time — the entry
    // already exists, so there's never a $push, and never a second entry.
    const updatedDoc = {
      _id: "pay_doc_1",
      amountPaise: 50000,
      refunds: [{ razorpayRefundId: "rfnd_1", amountPaise: 50000, status: "PROCESSED", processedAt: new Date(), notes: { bookingId: "b1" } }],
      refundedAmount: () => 50000,
    };
    Payment.findOneAndUpdate.mockResolvedValue(updatedDoc);
    const bookingDoc = { _id: "b1", status: "CANCELLED", refundStatus: "REFUND_PENDING", payoutStatus: "PENDING", save: vi.fn().mockResolvedValue(true) };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent(
      "refund.processed",
      webhookPayload("refund.processed", "refund", { id: "rfnd_1", payment_id: "pay_real", amount: 50000 })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenCalledTimes(1); // case 1 matched — no $push attempted
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      { razorpayPaymentId: "pay_real", "refunds.razorpayRefundId": "rfnd_1" },
      expect.objectContaining({ $set: expect.objectContaining({ "refunds.$.status": "PROCESSED" }) }),
      { new: true }
    );

    // replaying the exact same webhook again still only ever hits case 1
    await handleWebhookEvent(
      "refund.processed",
      webhookPayload("refund.processed", "refund", { id: "rfnd_1", payment_id: "pay_real", amount: 50000 })
    );
    expect(Payment.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("refund.failed records the failure without throwing, for manual follow-up", async () => {
    Payment.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: "pay_doc_1",
      refunds: [{ razorpayRefundId: "rfnd_1", status: "FAILED", amountPaise: 50000 }],
    });

    await handleWebhookEvent(
      "refund.failed",
      webhookPayload("refund.failed", "refund", { id: "rfnd_1", payment_id: "pay_real", amount: 50000 })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { razorpayPaymentId: "pay_real", "refunds.razorpayRefundId": { $ne: "rfnd_1" } },
      expect.objectContaining({ $push: { refunds: expect.objectContaining({ razorpayRefundId: "rfnd_1", status: "FAILED", amountPaise: 50000 }) } }),
      { new: true }
    );
  });

  it("an unrecognized event type is a safe no-op", async () => {
    await expect(
      handleWebhookEvent("subscription.charged", { event: "subscription.charged", payload: {} })
    ).resolves.toBeUndefined();
  });
});

