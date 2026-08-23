import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.model.js", () => ({
  default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), findOne: vi.fn(), findByIdAndUpdate: vi.fn() },
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
  default: { RAZORPAY_KEY_ID: "key", PAYMENT_RESERVATION_MINUTES: 10, PLATFORM_COMMISSION_RATE: 0.1 },
  isRazorpayConfigured: () => true,
}));
vi.mock("../notification/email.service.js", () => ({
  sendBookingConfirmed: vi.fn().mockResolvedValue(null),
  sendPaymentSuccess: vi.fn().mockResolvedValue(null),
  sendOwnerNewBooking: vi.fn().mockResolvedValue(null),
  sendPaymentSucceededBookingFailed: vi.fn().mockResolvedValue(null),
  sendRefundCompleted: vi.fn().mockResolvedValue(null),
}));

const Payment = (await import("./payment.model.js")).default;
const Booking = (await import("../booking/booking.model.js")).default;
const { confirmSlot } = await import("../booking/booking.service.js");
const { finalizePaymentSuccess, handleWebhookEvent } = await import("./payment.service.js");

describe("Commission split on booking confirmation (finalizePaymentSuccess)", () => {
  beforeEach(() => vi.clearAllMocks());

  const paymentDoc = { _id: "pay_doc_1", razorpayOrderId: "order_1", userId: "user_1", slotIds: ["slot_1"], groupId: null };

  it("computes a 10% commission / 90% owner split from the booking's amount and stores it as PENDING", async () => {
    Payment.findOneAndUpdate.mockResolvedValue({
      _id: "pay_doc_1",
      slotIds: ["slot_1"],
      groupId: null,
      userId: "user_1",
    });
    confirmSlot.mockResolvedValue({ _id: "booking_1", amount: 500 });
    Booking.findByIdAndUpdate.mockResolvedValue({});
    Payment.findByIdAndUpdate.mockResolvedValue({});
    Payment.findById.mockResolvedValue({ _id: "pay_doc_1", bookingIds: ["booking_1"] });

    await finalizePaymentSuccess({
      paymentDoc,
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_real",
      razorpaySignature: "sig",
      method: "card",
      source: "CALLBACK",
    });

    expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith("booking_1", {
      paymentId: "pay_doc_1",
      paymentMethod: "ONLINE",
      commissionAmount: 50,
      ownerAmount: 450,
      payoutStatus: "PENDING",
    });
  });

  it("rounds to paise rather than leaving floating-point remainders", async () => {
    Payment.findOneAndUpdate.mockResolvedValue({
      _id: "pay_doc_1",
      slotIds: ["slot_1"],
      groupId: null,
      userId: "user_1",
    });
    confirmSlot.mockResolvedValue({ _id: "booking_1", amount: 333 });
    Booking.findByIdAndUpdate.mockResolvedValue({});
    Payment.findByIdAndUpdate.mockResolvedValue({});
    Payment.findById.mockResolvedValue({ _id: "pay_doc_1", bookingIds: ["booking_1"] });

    await finalizePaymentSuccess({
      paymentDoc,
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_real",
      razorpaySignature: "sig",
      method: "card",
      source: "CALLBACK",
    });

    const call = Booking.findByIdAndUpdate.mock.calls[0][1];
    expect(call.commissionAmount + call.ownerAmount).toBeCloseTo(333, 5);
    expect(call.commissionAmount).toBeCloseTo(33.3, 5);
  });
});

describe("Payout clawback on refund.processed (full clawback policy)", () => {
  beforeEach(() => vi.clearAllMocks());

  const refundWebhook = () => ({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_real", amount: 50000 } } },
  });

  // finalizeRefundIfComplete only matches a refund to "its" booking via the
  // notes.bookingId tag set when the refund was created (initiateRefundForBooking) —
  // seeding an existing refunds[] entry with that tag mirrors the real
  // create -> webhook-confirm sequence. upsertRefundEntry now does this
  // atomically (Payment.findOneAndUpdate with the positional operator, see
  // payment.service.js), not a load-then-.save() round trip — an existing
  // entry means its "update in place" branch matches on the first call and
  // returns the already-updated document directly.
  const paymentDocWithTaggedRefund = (amount = 500) => ({
    _id: "pay_doc_1",
    amount: 500,
    refunds: [{ razorpayRefundId: "rfnd_1", amount, status: "PROCESSED", notes: { bookingId: "b1" } }],
    refundedAmount: () => amount,
  });

  it("voids a still-PENDING payout — nothing was ever actually paid out, so nothing to claw back", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(paymentDocWithTaggedRefund());
    const bookingDoc = { _id: "b1", status: "CANCELLED", refundStatus: "REFUND_PENDING", payoutStatus: "PENDING", save: vi.fn().mockResolvedValue(true) };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook());

    expect(bookingDoc.refundStatus).toBe("REFUNDED");
    expect(bookingDoc.payoutStatus).toBe("VOID");
  });

  it("flags an already-PAID payout as CLAWBACK_OWED instead of silently erasing that the owner was paid", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(paymentDocWithTaggedRefund());
    const bookingDoc = { _id: "b1", status: "CANCELLED", refundStatus: "REFUND_PENDING", payoutStatus: "PAID", save: vi.fn().mockResolvedValue(true) };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook());

    expect(bookingDoc.payoutStatus).toBe("CLAWBACK_OWED");
  });

  it("leaves a NONE/VOID payoutStatus untouched (CASH booking or an already-clawed-back one)", async () => {
    Payment.findOneAndUpdate.mockResolvedValue(paymentDocWithTaggedRefund());
    const bookingDoc = { _id: "b1", status: "CANCELLED", refundStatus: "REFUND_PENDING", payoutStatus: "NONE", save: vi.fn().mockResolvedValue(true) };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook());

    expect(bookingDoc.payoutStatus).toBe("NONE");
  });
});
