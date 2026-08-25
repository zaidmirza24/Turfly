import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.model.js", () => ({
  default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("./webhookEvent.model.js", () => ({ default: { create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("../booking/booking.model.js", () => ({
  default: { find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("../slot/slot.model.js", () => ({ default: { updateMany: vi.fn(), findByIdAndUpdate: vi.fn() } }));
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
  default: { RAZORPAY_KEY_ID: "key", PAYMENT_RESERVATION_MINUTES: 10, PLATFORM_COMMISSION_RATE: 0.1 },
  isRazorpayConfigured: () => true,
}));
vi.mock("../settings/settings.service.js", () => ({
  getCommissionRate: vi.fn().mockResolvedValue(0.1),
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
const Slot = (await import("../slot/slot.model.js")).default;
const { confirmSlot, forceCancelForSystem } = await import("../booking/booking.service.js");
const { getRazorpayClient } = await import("./razorpay.client.js");
const emailService = await import("../notification/email.service.js");
const { findStuckPayments, reconcileStuckPayment, handleWebhookEvent } = await import("./payment.service.js");

// vi.resetAllMocks() (rather than clearAllMocks) between tests, deliberately
// — a non-Once implementation set via .mockResolvedValue/.mockReturnValue in
// one test otherwise silently persists into the next (clearAllMocks only
// resets call history, not implementations), which previously let one
// test's Booking.find stub leak into an unrelated test and fail it for the
// wrong reason. resetAllMocks also wipes the emailService defaults declared
// in the vi.mock factory above, so they're restored here.
const restoreEmailDefaults = () => {
  emailService.sendBookingConfirmed.mockResolvedValue(null);
  emailService.sendPaymentSucceededBookingFailed.mockResolvedValue(null);
  emailService.sendRefundCompleted.mockResolvedValue(null);
};

// ── findStuckPayments / reconcileStuckPayment — the PAID-with-no-booking
// crash window (finalizePaymentSuccess killed mid-loop) ────────────────────

describe("findStuckPayments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    restoreEmailDefaults();
  });

  it("flags a PAID payment whose bookingIds is shorter than slotIds", async () => {
    const select = vi.fn().mockReturnThis();
    const sort = vi.fn().mockReturnThis();
    const limit = vi.fn().mockReturnThis();
    const lean = vi.fn().mockResolvedValue([
      { _id: "pay_1", slotIds: ["s1", "s2"], bookingIds: ["b1"] }, // stuck: 1 of 2
      { _id: "pay_2", slotIds: ["s1"], bookingIds: ["b1"] }, // complete: not stuck
    ]);
    Payment.find.mockReturnValue({ select, sort, limit, lean });

    const { items } = await findStuckPayments();

    expect(items).toHaveLength(1);
    expect(items[0]._id).toBe("pay_1");
  });

  it("only looks at PAID payments older than the stuck-detection window", async () => {
    const select = vi.fn().mockReturnThis();
    const sort = vi.fn().mockReturnThis();
    const limit = vi.fn().mockReturnThis();
    const lean = vi.fn().mockResolvedValue([]);
    Payment.find.mockReturnValue({ select, sort, limit, lean });

    await findStuckPayments();

    const query = Payment.find.mock.calls[0][0];
    expect(query.status).toBe("PAID");
    expect(query.paidAt.$lt).toBeInstanceOf(Date);
    expect(query.paidAt.$lt.getTime()).toBeLessThan(Date.now());
  });
});

describe("reconcileStuckPayment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    restoreEmailDefaults();
  });

  it("finishes booking whichever slots are still unclaimed, and leaves already-booked ones alone", async () => {
    const payment = {
      _id: "pay_1",
      status: "PAID",
      userId: "user_1",
      slotIds: ["s1", "s2"],
      bookingIds: ["b1"],
      groupId: "grp_1",
      amountPaise: 100000,
    };
    Payment.findById.mockResolvedValueOnce(payment).mockResolvedValueOnce({ ...payment, bookingIds: ["b1", "b2"] });
    Booking.find.mockReturnValue({ select: vi.fn().mockResolvedValue([{ _id: "b1", slotId: "s1" }]) });
    confirmSlot.mockResolvedValue({ _id: "b2", amountPaise: 50000 });
    Booking.findByIdAndUpdate.mockResolvedValue({});
    Payment.findByIdAndUpdate.mockResolvedValue({});

    const result = await reconcileStuckPayment("pay_1");

    expect(confirmSlot).toHaveBeenCalledTimes(1);
    expect(confirmSlot).toHaveBeenCalledWith("user_1", "s2", "grp_1");
    expect(result.recovered).toHaveLength(1);
    expect(result.recovered[0]._id).toBe("b2");
  });

  it("is a safe no-op when bookingIds was just behind reality — no re-booking, no refund", async () => {
    const payment = { _id: "pay_1", status: "PAID", userId: "user_1", slotIds: ["s1"], bookingIds: [], groupId: null, amountPaise: 50000 };
    Payment.findById.mockResolvedValueOnce(payment).mockResolvedValueOnce(payment);
    Booking.find.mockReturnValue({ select: vi.fn().mockResolvedValue([{ _id: "b1", slotId: "s1" }]) }); // already exists, bookingIds just hadn't caught up
    Payment.findByIdAndUpdate.mockResolvedValue({});

    const result = await reconcileStuckPayment("pay_1");

    expect(result.alreadyComplete).toBe(true);
    expect(confirmSlot).not.toHaveBeenCalled();
  });

  it("refuses to reconcile a payment that isn't PAID", async () => {
    Payment.findById.mockResolvedValue({ _id: "pay_1", status: "FAILED" });
    await expect(reconcileStuckPayment("pay_1")).rejects.toThrow(/Only a PAID payment/);
  });

  it("rolls back and fully refunds if a missing slot can no longer be claimed", async () => {
    const payment = {
      _id: "pay_1",
      status: "PAID",
      userId: "user_1",
      slotIds: ["s1"],
      bookingIds: [],
      groupId: null,
      amountPaise: 50000,
      razorpayPaymentId: "pay_real",
      refundedAmount: () => 0,
    };
    Payment.findById.mockResolvedValue(payment);
    Booking.find.mockReturnValue({ select: vi.fn().mockResolvedValue([]) });
    confirmSlot.mockRejectedValue(new Error("Slot lock expired or was not locked by you"));
    Payment.findByIdAndUpdate.mockResolvedValue({});
    getRazorpayClient.mockReturnValue({
      payments: { refund: vi.fn().mockResolvedValue({ id: "rfnd_x", status: "created" }) },
    });

    const result = await reconcileStuckPayment("pay_1");

    expect(forceCancelForSystem).not.toHaveBeenCalled(); // nothing had been recovered yet to roll back
    expect(Payment.findByIdAndUpdate).toHaveBeenCalledWith(
      "pay_1",
      expect.objectContaining({ status: "PAID_BOOKING_FAILED", bookingIds: [] })
    );
    expect(result.bookingFailed).toBe(true);
    expect(getRazorpayClient().payments.refund).toHaveBeenCalledWith(
      "pay_real",
      expect.objectContaining({ amount: 50000 })
    );
  });
});

// ── External (dashboard-initiated) refund reconciliation ──────────────────
// This app never requests refunds itself, so every refund this webhook sees
// was issued directly from the Razorpay dashboard — reconciliation still
// must cancel the booking, release the slot, and void/clawback the payout,
// not silently leave the booking CONFIRMED while the customer's money is
// already back in their account.

describe("finalizeRefundIfComplete — externally-initiated refund", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    restoreEmailDefaults();
  });

  const refundWebhook = (amount) => ({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_real", amount } } },
  });

  it("a full external refund cancels the booking, releases the slot, and voids the payout", async () => {
    const paymentDoc = {
      _id: "pay_1",
      amountPaise: 50000,
      refunds: [{ razorpayRefundId: "rfnd_1", amountPaise: 50000, status: "PROCESSED" }], // no notes.bookingId
      refundedAmount: () => 50000,
    };
    Payment.findOneAndUpdate.mockResolvedValue(paymentDoc); // case 1: entry already existed (created earlier)
    const bookingDoc = {
      _id: "b1",
      slotId: "s1",
      status: "CONFIRMED",
      refundStatus: "NONE",
      payoutStatus: "PENDING",
      save: vi.fn().mockResolvedValue(true),
    };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook(50000));

    expect(bookingDoc.status).toBe("CANCELLED");
    expect(bookingDoc.cancelledBy).toBe("SYSTEM");
    expect(bookingDoc.refundStatus).toBe("REFUNDED");
    expect(bookingDoc.payoutStatus).toBe("VOID");
    expect(Slot.findByIdAndUpdate).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ status: "AVAILABLE", bookingId: null })
    );
  });

  it("a partial external refund with no note match is left for manual reconciliation, not guessed at", async () => {
    const paymentDoc = {
      _id: "pay_1",
      amountPaise: 100000,
      refunds: [{ razorpayRefundId: "rfnd_1", amountPaise: 30000, status: "PROCESSED" }],
      refundedAmount: () => 30000, // less than payment.amountPaise — not a full refund
    };
    Payment.findOneAndUpdate.mockResolvedValue(paymentDoc);
    const bookingDoc = {
      _id: "b1",
      slotId: "s1",
      status: "CONFIRMED",
      refundStatus: "NONE",
      payoutStatus: "PENDING",
      save: vi.fn().mockResolvedValue(true),
    };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook(30000));

    // Left untouched — a partial refund across an ambiguous set of bookings
    // must not be auto-applied to one of them by guessing.
    expect(bookingDoc.status).toBe("CONFIRMED");
    expect(bookingDoc.save).not.toHaveBeenCalled();
  });

  it("no bookings left under the payment is a safe no-op", async () => {
    const paymentDoc = {
      _id: "pay_1",
      amountPaise: 50000,
      refunds: [{ razorpayRefundId: "rfnd_1", amountPaise: 50000, status: "PROCESSED" }],
      refundedAmount: () => 50000,
    };
    Payment.findOneAndUpdate.mockResolvedValue(paymentDoc);
    Booking.find.mockResolvedValue([]);

    await expect(handleWebhookEvent("refund.processed", refundWebhook(50000))).resolves.toBeUndefined();
  });

  it("a full external refund still reconciles a booking already cancelled through the app, flagging clawback if it was paid out", async () => {
    const paymentDoc = {
      _id: "pay_1",
      amountPaise: 50000,
      refunds: [{ razorpayRefundId: "rfnd_1", amountPaise: 50000, status: "PROCESSED" }],
      refundedAmount: () => 50000,
    };
    Payment.findOneAndUpdate.mockResolvedValue(paymentDoc);
    const bookingDoc = {
      _id: "b1",
      slotId: "s1",
      status: "CANCELLED",
      refundStatus: "NONE",
      payoutStatus: "PAID",
      save: vi.fn().mockResolvedValue(true),
    };
    Booking.find.mockResolvedValue([bookingDoc]);

    await handleWebhookEvent("refund.processed", refundWebhook(50000));

    expect(bookingDoc.refundStatus).toBe("REFUNDED");
    expect(bookingDoc.payoutStatus).toBe("CLAWBACK_OWED");
    expect(Slot.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
