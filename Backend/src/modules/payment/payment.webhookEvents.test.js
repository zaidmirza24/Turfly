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
  sendPaymentFailure: vi.fn().mockResolvedValue(null),
  sendRefundInitiated: vi.fn().mockResolvedValue(null),
  sendRefundCompleted: vi.fn().mockResolvedValue(null),
}));

const Payment = (await import("./payment.model.js")).default;
const Booking = (await import("../booking/booking.model.js")).default;
const { getRazorpayClient } = await import("./razorpay.client.js");
const {
  handleWebhookEvent,
  initiateRefundForBooking,
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
      amount: 500,
      refunds: [{ razorpayRefundId: "rfnd_1", status: "PROCESSED", amount: 500, notes: { bookingId: "b1" } }],
      refundedAmount: () => 500,
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
      expect.objectContaining({ $push: { refunds: expect.objectContaining({ razorpayRefundId: "rfnd_1", amount: 500, status: "PROCESSED" }) } }),
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
      amount: 500,
      refunds: [{ razorpayRefundId: "rfnd_1", amount: 500, status: "PROCESSED", processedAt: new Date(), notes: { bookingId: "b1" } }],
      refundedAmount: () => 500,
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
      refunds: [{ razorpayRefundId: "rfnd_1", status: "FAILED", amount: 500 }],
    });

    await handleWebhookEvent(
      "refund.failed",
      webhookPayload("refund.failed", "refund", { id: "rfnd_1", payment_id: "pay_real", amount: 50000 })
    );

    expect(Payment.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { razorpayPaymentId: "pay_real", "refunds.razorpayRefundId": { $ne: "rfnd_1" } },
      expect.objectContaining({ $push: { refunds: expect.objectContaining({ razorpayRefundId: "rfnd_1", status: "FAILED", amount: 500 }) } }),
      { new: true }
    );
  });

  it("an unrecognized event type is a safe no-op", async () => {
    await expect(
      handleWebhookEvent("subscription.charged", { event: "subscription.charged", payload: {} })
    ).resolves.toBeUndefined();
  });
});

describe("initiateRefundForBooking (Section 8/9 — cancellation-triggered refund)", () => {
  beforeEach(() => vi.clearAllMocks());

  const booking = (overrides = {}) => ({
    _id: "b1",
    paymentId: "pay_1",
    amount: 500,
    refundStatus: "NONE",
    ...overrides,
  });

  it("TC-8.x — a cash/manual booking with no paymentId is a safe no-op, never calls Razorpay", async () => {
    const result = await initiateRefundForBooking(booking({ paymentId: null }), { initiatedBy: "SYSTEM" });
    expect(result).toMatchObject({ refunded: false });
    expect(Payment.findById).not.toHaveBeenCalled();
  });

  it("TC-8.x — refuses to refund a payment that never captured (not PAID)", async () => {
    Payment.findById.mockResolvedValue({ status: "ORDER_CREATED" });
    const result = await initiateRefundForBooking(booking(), { initiatedBy: "SYSTEM" });
    expect(result).toMatchObject({ refunded: false, reason: "Payment is not in a refundable state" });
  });

  it("TC-8.6/8.7 — refuses a second refund attempt once the atomic claim finds the booking already REFUND_PENDING or REFUNDED", async () => {
    Payment.findById.mockResolvedValue({ status: "PAID" });
    // The atomic claim's filter (refundStatus $in [NONE, REFUND_FAILED]) is
    // exactly what would exclude these two states in real Mongo — asserting
    // null here is what that exclusion looks like from the caller's side.
    Booking.findOneAndUpdate.mockResolvedValue(null);

    const pending = await initiateRefundForBooking(booking({ refundStatus: "REFUND_PENDING" }), { initiatedBy: "SYSTEM" });
    expect(pending.refunded).toBe(false);

    const done = await initiateRefundForBooking(booking({ refundStatus: "REFUNDED" }), { initiatedBy: "SYSTEM" });
    expect(done.refunded).toBe(false);
  });

  it("TC-5.x/8.7 regression — a concurrent second cancellation on the same booking never reaches Razorpay once the first has claimed it", async () => {
    Payment.findById.mockResolvedValue({ status: "PAID" });
    const refund = vi.fn().mockResolvedValue({ id: "rfnd_x", status: "created" });
    getRazorpayClient.mockReturnValue({ payments: { refund } });

    // First caller wins the atomic claim (NONE -> REFUND_PENDING)...
    Booking.findOneAndUpdate.mockResolvedValueOnce({ _id: "b1", refundStatus: "REFUND_PENDING" });
    // ...the second, racing caller loses it (booking is no longer NONE/REFUND_FAILED).
    Booking.findOneAndUpdate.mockResolvedValueOnce(null);

    Payment.findById.mockResolvedValue({
      _id: "pay_1",
      status: "PAID",
      amount: 500,
      razorpayPaymentId: "pay_real",
      refunds: [],
      refundedAmount: () => 0,
    });

    const [first, second] = await Promise.all([
      initiateRefundForBooking(booking(), { initiatedBy: "CUSTOMER_CANCELLATION" }),
      initiateRefundForBooking(booking(), { initiatedBy: "CUSTOMER_CANCELLATION" }),
    ]);

    expect([first.refunded, second.refunded].filter(Boolean)).toHaveLength(1);
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("TC-9.5 — a full refund is issued for the booking's own amount, tagged with who initiated it", async () => {
    Payment.findById.mockResolvedValue({
      _id: "pay_1",
      status: "PAID",
      amount: 500,
      razorpayPaymentId: "pay_real",
      refunds: [],
      refundedAmount: () => 0,
    });
    Payment.findByIdAndUpdate.mockResolvedValue({});
    Booking.findOneAndUpdate.mockResolvedValue({ _id: "b1", refundStatus: "REFUND_PENDING" });
    getRazorpayClient.mockReturnValue({
      payments: { refund: vi.fn().mockResolvedValue({ id: "rfnd_x", status: "created" }) },
    });

    const result = await initiateRefundForBooking(booking(), { initiatedBy: "OWNER_CANCELLATION" });

    expect(result).toMatchObject({ refunded: true, razorpayRefundId: "rfnd_x" });
    expect(getRazorpayClient().payments.refund).toHaveBeenCalledWith(
      "pay_real",
      expect.objectContaining({ amount: 50000 })
    );
    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "b1", refundStatus: { $in: ["NONE", "REFUND_FAILED"] } },
      { refundStatus: "REFUND_PENDING" },
      { new: true }
    );
  });

  it("TC-8.8 — a Razorpay refund API failure marks the booking REFUND_FAILED instead of leaving it silently pending", async () => {
    Payment.findById.mockResolvedValue({
      _id: "pay_1",
      status: "PAID",
      amount: 500,
      razorpayPaymentId: "pay_real",
      refunds: [],
      refundedAmount: () => 0,
    });
    Booking.findOneAndUpdate.mockResolvedValue({ _id: "b1", refundStatus: "REFUND_PENDING" });
    Booking.findByIdAndUpdate.mockResolvedValue({});
    getRazorpayClient.mockReturnValue({
      payments: { refund: vi.fn().mockRejectedValue(new Error("Razorpay 502")) },
    });

    const result = await initiateRefundForBooking(booking(), { initiatedBy: "CUSTOMER_CANCELLATION" });

    expect(result).toMatchObject({ refunded: false, reason: "REFUND_FAILED" });
    expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith("b1", { refundStatus: "REFUND_FAILED" });
  });

  it("TC-8.2 (boundary) — refuses a refund whose amount would exceed what was actually captured", async () => {
    Payment.findById.mockResolvedValue({
      _id: "pay_1",
      status: "PAID",
      amount: 500,
      razorpayPaymentId: "pay_real",
      refunds: [],
      refundedAmount: () => 400, // already refunded 400 of 500
    });
    Booking.findOneAndUpdate.mockResolvedValue({ _id: "b1", refundStatus: "REFUND_PENDING" });
    Booking.findByIdAndUpdate.mockResolvedValue({});

    const result = await initiateRefundForBooking(booking({ amount: 200 }), { initiatedBy: "SYSTEM" }); // 400 + 200 > 500

    expect(result.refunded).toBe(false);
    expect(result.reason).toBe("REFUND_FAILED");
  });
});
