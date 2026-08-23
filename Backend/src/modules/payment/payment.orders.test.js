import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./payment.model.js", () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));
vi.mock("./webhookEvent.model.js", () => ({ default: { create: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("../booking/booking.model.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../slot/slot.model.js", () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));
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
  isRazorpayConfigured: vi.fn(() => true),
}));
vi.mock("../notification/email.service.js", () => ({
  sendBookingConfirmed: vi.fn().mockResolvedValue(null),
  sendPaymentSuccess: vi.fn().mockResolvedValue(null),
  sendOwnerNewBooking: vi.fn().mockResolvedValue(null),
  sendPaymentSucceededBookingFailed: vi.fn().mockResolvedValue(null),
}));

const Payment = (await import("./payment.model.js")).default;
const Slot = (await import("../slot/slot.model.js")).default;
const Turf = (await import("../turf/turf.model.js")).default;
const { validateSlotSelection } = await import("../booking/booking.service.js");
const { getRazorpayClient } = await import("./razorpay.client.js");
const { isRazorpayConfigured } = await import("../../common/config/env.js");
const { createOrGetOrder, getPaymentById } = await import("./payment.service.js");

const withSelect = (value) => ({ select: vi.fn().mockResolvedValue(value) });

describe("createOrGetOrder (Section 7 — server-computed amount, never client-supplied)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRazorpayConfigured.mockReturnValue(true);
  });

  it("TC-7.1 — computes the order amount purely from each locked slot's own lockedPrice, ignoring any amount the caller passed in", async () => {
    validateSlotSelection.mockResolvedValue({ uniqueIds: ["slot1", "slot2"], turfId: "turf1" });
    Slot.find.mockReturnValue(
      withSelect([
        { _id: "slot1", pricePaise: 100000, lockedPricePaise: 40000 },
        { _id: "slot2", pricePaise: 100000, lockedPricePaise: 40000 },
      ])
    );
    Slot.updateMany.mockResolvedValue({ modifiedCount: 2 });
    Payment.create.mockResolvedValue({
      _id: "pay_1",
      amountPaise: 80000,
      save: vi.fn().mockResolvedValue(true),
    });
    getRazorpayClient.mockReturnValue({
      orders: { create: vi.fn().mockResolvedValue({ id: "order_real" }) },
    });
    Turf.findById.mockReturnValue(withSelect({ name: "Turf A" }));

    // The function's own signature never accepts a client amount at all — the
    // request-shaped input the controller forwards is only { slotIds, groupId }
    // (see payment.controller.js#createOrder). Passing an extra, attacker-added
    // `amount` field here must have zero effect on what's actually charged.
    const result = await createOrGetOrder(
      { _id: "user1", name: "A", email: "a@a.com" },
      { slotIds: ["slot1", "slot2"], amount: 1 } // attacker-injected field
    );

    expect(Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 80000 }) // 40000 + 40000 from lockedPricePaise, not the injected `1`
    );
    expect(result.amount).toBe(80000); // checkout payload carries paise natively now
  });

  it("TC-2.5 — a Razorpay order-creation failure marks the payment FAILED instead of leaving it silently CREATED forever", async () => {
    validateSlotSelection.mockResolvedValue({ uniqueIds: ["slot1"], turfId: "turf1" });
    Slot.find.mockReturnValue(withSelect([{ _id: "slot1", pricePaise: 50000, lockedPricePaise: 50000 }]));
    Slot.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const paymentDoc = { _id: "pay_1", amountPaise: 50000, save: vi.fn().mockResolvedValue(true) };
    Payment.create.mockResolvedValue(paymentDoc);
    getRazorpayClient.mockReturnValue({
      orders: { create: vi.fn().mockRejectedValue(new Error("Razorpay 500")) },
    });

    await expect(
      createOrGetOrder({ _id: "user1" }, { slotIds: ["slot1"] })
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(paymentDoc.status).toBe("FAILED");
    expect(paymentDoc.failureReason).toBe("PAYMENT_ORDER_CREATION_FAILED");
  });

  it("rejects a slot selection that lost its lock before checkout (409), never creating a Payment doc", async () => {
    validateSlotSelection.mockResolvedValue({ uniqueIds: ["slot1"], turfId: "turf1" });
    Slot.find.mockReturnValue(withSelect([])); // lock was lost — nothing comes back LOCKED-by-this-user

    await expect(
      createOrGetOrder({ _id: "user1" }, { slotIds: ["slot1"] })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(Payment.create).not.toHaveBeenCalled();
  });

  it("returns 503 without touching the DB when Razorpay isn't configured", async () => {
    isRazorpayConfigured.mockReturnValue(false);
    await expect(createOrGetOrder({ _id: "user1" }, { slotIds: ["slot1"] })).rejects.toMatchObject({ statusCode: 503 });
    expect(validateSlotSelection).not.toHaveBeenCalled();
  });

  describe("TC-5.1/5.2/1.3 — groupId resume path (double-click / refresh / retry protection)", () => {
    it("TC-1.3/5.4 — an already-PAID payment resumes as an idempotent success, never creating a second order", async () => {
      Payment.findOne.mockResolvedValue({
        _id: "pay_1",
        userId: "user1",
        status: "PAID",
        bookingIds: ["b1", "b2"],
      });

      const result = await createOrGetOrder({ _id: "user1" }, { slotIds: [], groupId: "group_1" });

      expect(result).toMatchObject({ alreadyPaid: true, paymentId: "pay_1", bookingIds: ["b1", "b2"] });
      expect(getRazorpayClient).not.toHaveBeenCalled();
    });

    it("TC-5.5 — refuses to resume a payment that already captured but whose booking failed to confirm (must not be paid again)", async () => {
      Payment.findOne.mockResolvedValue({ _id: "pay_1", userId: "user1", status: "PAID_BOOKING_FAILED" });

      await expect(
        createOrGetOrder({ _id: "user1" }, { slotIds: [], groupId: "group_1" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("TC-5.2 — an ORDER_CREATED payment with a live razorpayOrderId is resumed as-is, not recreated", async () => {
      Payment.findOne.mockResolvedValue({
        _id: "pay_1",
        userId: "user1",
        status: "ORDER_CREATED",
        razorpayOrderId: "order_existing",
        slotIds: ["slot1"],
        amountPaise: 50000,
        currency: "INR",
        turfId: "turf1",
        save: vi.fn().mockResolvedValue(true),
      });
      Slot.updateMany.mockResolvedValue({ modifiedCount: 1 });
      Turf.findById.mockReturnValue(withSelect({ name: "Turf A" }));

      const result = await createOrGetOrder({ _id: "user1", name: "A", email: "a@a.com" }, { groupId: "group_1" });

      expect(getRazorpayClient).not.toHaveBeenCalled(); // no new order.create — reused the existing order id
      expect(result.orderId).toBe("order_existing");
    });

    it("rejects resuming a checkout whose lock has since lapsed, rather than silently letting an expired session pay", async () => {
      Payment.findOne.mockResolvedValue({
        _id: "pay_1",
        userId: "user1",
        status: "ORDER_CREATED",
        razorpayOrderId: "order_existing",
        slotIds: ["slot1"],
        amountPaise: 50000,
      });
      Slot.updateMany.mockResolvedValue({ modifiedCount: 0 }); // lock expired — nothing to extend

      await expect(
        createOrGetOrder({ _id: "user1" }, { groupId: "group_1" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("an unrecognized/foreign groupId falls through to a fresh checkout rather than trusting client-supplied state", async () => {
      Payment.findOne.mockResolvedValue(null);
      validateSlotSelection.mockResolvedValue({ uniqueIds: ["slot1"], turfId: "turf1" });
      Slot.find.mockReturnValue(withSelect([{ _id: "slot1", pricePaise: 50000, lockedPricePaise: 50000 }]));
      Slot.updateMany.mockResolvedValue({ modifiedCount: 1 });
      Payment.create.mockResolvedValue({ _id: "pay_2", amountPaise: 50000, save: vi.fn().mockResolvedValue(true) });
      getRazorpayClient.mockReturnValue({ orders: { create: vi.fn().mockResolvedValue({ id: "order_new" }) } });
      Turf.findById.mockReturnValue(withSelect({ name: "Turf A" }));

      const result = await createOrGetOrder(
        { _id: "user1", name: "A", email: "a@a.com" },
        { slotIds: ["slot1"], groupId: "group_not_mine" }
      );

      expect(result.orderId).toBe("order_new");
    });
  });
});

describe("getPaymentById (Section 19 — authorization / IDOR protection)", () => {
  beforeEach(() => vi.clearAllMocks());

  const withPopulate = (value) => ({ populate: vi.fn().mockResolvedValue(value) });

  it("TC-19.1 — a customer cannot read another customer's payment", async () => {
    Payment.findById.mockReturnValue(withPopulate({ _id: "pay_1", userId: { toString: () => "victim" } }));

    await expect(
      getPaymentById({ _id: "attacker", role: "USER" }, "507f1f77bcf86cd799439011")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("a customer can read their own payment", async () => {
    Payment.findById.mockReturnValue(withPopulate({ _id: "pay_1", userId: { toString: () => "user1" } }));

    await expect(getPaymentById({ _id: "user1", role: "USER" }, "507f1f77bcf86cd799439011")).resolves.toMatchObject({ _id: "pay_1" });
  });

  it("TC-19.5 — an owner cannot read a payment for a turf they don't own", async () => {
    Payment.findById.mockReturnValue(
      withPopulate({ _id: "pay_1", userId: { toString: () => "someUser" }, turfId: "turf1" })
    );
    Turf.findById.mockReturnValue(withSelect({ ownerId: { toString: () => "other-owner" } }));

    await expect(
      getPaymentById({ _id: "owner1", role: "OWNER" }, "507f1f77bcf86cd799439011")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("an owner can read a payment for their own turf", async () => {
    Payment.findById.mockReturnValue(
      withPopulate({ _id: "pay_1", userId: { toString: () => "someUser" }, turfId: "turf1" })
    );
    Turf.findById.mockReturnValue(withSelect({ ownerId: { toString: () => "owner1" } }));

    await expect(getPaymentById({ _id: "owner1", role: "OWNER" }, "507f1f77bcf86cd799439011")).resolves.toMatchObject({ _id: "pay_1" });
  });

  it("rejects a malformed payment id before ever querying the DB", async () => {
    await expect(getPaymentById({ _id: "user1", role: "USER" }, "not-an-object-id")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(Payment.findById).not.toHaveBeenCalled();
  });

  it("404s on a well-formed id that doesn't exist, rather than leaking existence via a different error shape", async () => {
    Payment.findById.mockReturnValue(withPopulate(null));
    await expect(
      getPaymentById({ _id: "user1", role: "USER" }, "507f1f77bcf86cd799439011")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
