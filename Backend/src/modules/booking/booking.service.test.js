import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./booking.model.js", () => ({
  default: { create: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("../payout/payout.model.js", () => ({
  default: { create: vi.fn(), findByIdAndDelete: vi.fn() },
}));
vi.mock("../slot/slot.model.js", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock("../turf/turf.model.js", () => ({
  default: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("../turf/turf.service.js", () => ({
  isTurfBookable: vi.fn(() => true),
}));
vi.mock("../user/user.model.js", () => ({
  default: { findById: vi.fn() },
}));

const {
  lockSlot,
  confirmSlot,
  cancelBooking,
  cancelBookingAsOwner,
  createManualBooking,
  markBookingPaidOut,
  playTimeRangeFilter,
  markBookingNoShow,
} = await import("./booking.service.js");
const Slot = (await import("../slot/slot.model.js")).default;
const Turf = (await import("../turf/turf.model.js")).default;
const Booking = (await import("./booking.model.js")).default;
const User = (await import("../user/user.model.js")).default;
const Payout = (await import("../payout/payout.model.js")).default;
const { isTurfBookable } = await import("../turf/turf.service.js");

const withSelect = (value) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });
const withSelectNoLean = (value) => ({ select: vi.fn().mockResolvedValue(value) });

describe("lockSlot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects once the user already holds the maximum number of concurrent locks", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(true);
    Slot.countDocuments.mockResolvedValue(15);

    await expect(lockSlot("user1", "slot1")).rejects.toMatchObject({ statusCode: 429 });
    expect(Slot.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("proceeds to attempt the atomic lock when under the concurrent-hold cap", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(true);
    Slot.countDocuments.mockResolvedValue(3);
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", status: "LOCKED" });

    const result = await lockSlot("user1", "slot1");
    expect(result).toMatchObject({ _id: "slot1" });
    expect(Slot.findOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("rejects when the turf is not bookable, before ever attempting the lock", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: false, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(false);

    await expect(lockSlot("user1", "slot1")).rejects.toMatchObject({ statusCode: 409 });
    expect(Slot.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows a slot starting just minutes from now (no minimum advance notice)", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(true);
    Slot.countDocuments.mockResolvedValue(0);
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", status: "LOCKED" });

    await expect(lockSlot("user1", "slot1")).resolves.toMatchObject({ _id: "slot1" });
  });

  it("rejects a slot starting more than 30 days from now (max advance booking)", async () => {
    Slot.findById
      .mockReturnValueOnce(withSelect({ turfId: "turf1" }))
      .mockReturnValueOnce({ startTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000) }); // 45 days out
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(true);
    Slot.countDocuments.mockResolvedValue(0);
    Slot.findOneAndUpdate.mockResolvedValue(null);

    await expect(lockSlot("user1", "slot1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows a slot comfortably within the bookable window", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    isTurfBookable.mockReturnValue(true);
    Slot.countDocuments.mockResolvedValue(0);
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", status: "LOCKED" });

    await expect(lockSlot("user1", "slot1")).resolves.toMatchObject({ _id: "slot1" });
  });
});

describe("confirmSlot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("charges the price snapshotted at lock time, not the slot's current price", async () => {
    Slot.findOneAndUpdate.mockResolvedValue({
      _id: "slot1",
      turfId: "turf1",
      pricePaise: 120000, // price changed by the owner after the hold was created
      lockedPricePaise: 80000, // what the customer actually saw and agreed to
    });
    Booking.create.mockResolvedValue({ _id: "booking1", amountPaise: 80000 });
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await confirmSlot("user1", "slot1");

    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 80000 }));
  });

  it("falls back to the slot's current price if no lockedPrice was captured", async () => {
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", turfId: "turf1", pricePaise: 90000, lockedPricePaise: null });
    Booking.create.mockResolvedValue({ _id: "booking1", amountPaise: 90000 });
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await confirmSlot("user1", "slot1");

    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 90000 }));
  });

  it("rejects when the slot isn't locked by this user (lock expired or stolen)", async () => {
    Slot.findOneAndUpdate.mockResolvedValue(null);
    await expect(confirmSlot("user1", "slot1")).rejects.toMatchObject({ statusCode: 409 });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  // Every operational view filters and sorts on when a booking is *played*,
  // which is only queryable because these are copied off the slot here. If
  // this stops happening, date filters silently fall back to matching nothing
  // rather than failing loudly.
  it("copies the slot's start and end time onto the booking", async () => {
    const startTime = new Date("2026-08-24T11:30:00.000Z");
    const endTime = new Date("2026-08-24T12:00:00.000Z");
    Slot.findOneAndUpdate.mockResolvedValue({
      _id: "slot1",
      turfId: "turf1",
      startTime,
      endTime,
      pricePaise: 90000,
      lockedPricePaise: 90000,
    });
    Booking.create.mockResolvedValue({ _id: "booking1", amountPaise: 90000 });
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await confirmSlot("user1", "slot1");

    expect(Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ slotStartTime: startTime, slotEndTime: endTime })
    );
  });
});

describe("markBookingNoShow", () => {
  beforeEach(() => vi.clearAllMocks());

  const past = new Date(Date.now() - 60 * 60 * 1000);
  const future = new Date(Date.now() + 60 * 60 * 1000);

  const bookingDoc = (overrides = {}) => ({
    _id: "booking1",
    turfId: "turf1",
    status: "CONFIRMED",
    slotEndTime: past,
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  });

  const ownsIt = () => Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));

  it("records a no-show once the slot has finished", async () => {
    const booking = bookingDoc();
    Booking.findById.mockResolvedValue(booking);
    ownsIt();

    await markBookingNoShow({ _id: "owner1", role: "OWNER" }, "booking1");

    expect(booking.status).toBe("NO_SHOW");
    expect(booking.save).toHaveBeenCalled();
  });

  // The distinction the whole state exists for: a no-show keeps the money and
  // consumes the slot, where a cancellation refunds and frees it. Nothing here
  // may touch the slot or the refund.
  it("does not release the slot or start a refund", async () => {
    const booking = bookingDoc();
    Booking.findById.mockResolvedValue(booking);
    ownsIt();

    await markBookingNoShow({ _id: "owner1", role: "OWNER" }, "booking1");

    expect(Slot.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(booking.refundStatus).toBeUndefined();
  });

  it("refuses before the slot has finished — they haven't failed to turn up yet", async () => {
    Booking.findById.mockResolvedValue(bookingDoc({ slotEndTime: future }));
    ownsIt();

    await expect(
      markBookingNoShow({ _id: "owner1", role: "OWNER" }, "booking1")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses on a cancelled booking", async () => {
    Booking.findById.mockResolvedValue(bookingDoc({ status: "CANCELLED" }));
    ownsIt();

    await expect(
      markBookingNoShow({ _id: "owner1", role: "OWNER" }, "booking1")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses an owner acting on a turf they don't own", async () => {
    Booking.findById.mockResolvedValue(bookingDoc());
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "someone-else" } }));

    await expect(
      markBookingNoShow({ _id: "owner1", role: "OWNER" }, "booking1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("playTimeRangeFilter", () => {
  // The bug this guards: the range was applied to `createdAt`, so an owner
  // asking for today got bookings *placed* today rather than the day's
  // schedule. The field name is the entire fix.
  it("filters on play time, never on when the booking was created", () => {
    const filter = playTimeRangeFilter("2026-08-24", "2026-08-24");
    expect(filter).toHaveProperty("slotStartTime");
    expect(filter).not.toHaveProperty("createdAt");
  });

  it("returns an empty filter when no range is given, so the query is unrestricted", () => {
    expect(playTimeRangeFilter(undefined, undefined)).toEqual({});
  });
});

describe("cancelBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  const bookingDoc = (overrides = {}) => ({
    _id: "booking1",
    userId: { toString: () => "user1" },
    status: "CONFIRMED",
    slotId: "slot1",
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  });

  it("rejects cancellation inside the 6-hour cutoff before slot start", async () => {
    Booking.findById.mockResolvedValue(bookingDoc());
    Slot.findById.mockReturnValue(
      withSelect({ startTime: new Date(Date.now() + 3 * 60 * 60 * 1000) }) // 3h from now
    );

    await expect(cancelBooking("user1", "booking1")).rejects.toMatchObject({ statusCode: 400 });
    expect(Slot.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("allows cancellation outside the 6-hour cutoff and records the actor", async () => {
    const booking = bookingDoc();
    Booking.findById.mockResolvedValue(booking);
    Slot.findById.mockReturnValue(
      withSelect({ startTime: new Date(Date.now() + 10 * 60 * 60 * 1000) }) // 10h from now
    );
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await cancelBooking("user1", "booking1");

    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledBy).toBe("CUSTOMER");
    expect(booking.save).toHaveBeenCalledOnce();
  });

  it("rejects a user cancelling someone else's booking", async () => {
    Booking.findById.mockResolvedValue(bookingDoc());
    await expect(cancelBooking("someone-else", "booking1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("still rejects a slot that has already started, ahead of the cutoff check", async () => {
    Booking.findById.mockResolvedValue(bookingDoc());
    Slot.findById.mockReturnValue(withSelect({ startTime: new Date(Date.now() - 60 * 1000) }));

    await expect(cancelBooking("user1", "booking1")).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("cancelBookingAsOwner", () => {
  beforeEach(() => vi.clearAllMocks());

  const bookingDoc = (overrides = {}) => ({
    _id: "booking1",
    turfId: "turf1",
    status: "CONFIRMED",
    slotId: "slot1",
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  });

  it("rejects an owner cancelling a booking on a turf they don't own", async () => {
    Booking.findById.mockResolvedValue(bookingDoc());
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "some-other-owner" } }));

    await expect(
      cancelBookingAsOwner({ _id: "owner1", role: "OWNER" }, "booking1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows the owning owner to cancel regardless of the 6-hour cutoff, and records OWNER", async () => {
    const booking = bookingDoc();
    Booking.findById.mockResolvedValue(booking);
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await cancelBookingAsOwner({ _id: "owner1", role: "OWNER" }, "booking1", "maintenance emergency");

    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledBy).toBe("OWNER");
    expect(booking.notes).toBe("maintenance emergency");
  });

  it("allows an admin to cancel without owning the turf, and records ADMIN", async () => {
    const booking = bookingDoc();
    Booking.findById.mockResolvedValue(booking);
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await cancelBookingAsOwner({ _id: "admin1", role: "ADMIN" }, "booking1");

    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledBy).toBe("ADMIN");
  });

  it("rejects cancelling an already-cancelled booking", async () => {
    Booking.findById.mockResolvedValue(bookingDoc({ status: "CANCELLED" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));

    await expect(
      cancelBookingAsOwner({ _id: "owner1", role: "OWNER" }, "booking1")
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("createManualBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an owner creating a manual booking on a turf they don't own", async () => {
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "some-other-owner" } }));

    await expect(
      createManualBooking("owner1", { turfId: "turf1", customerId: "507f1f77bcf86cd799439011", slotIds: ["slot1"] })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects when a selected slot doesn't belong to the specified turf", async () => {
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));
    Slot.find.mockReturnValue(withSelect([{ turfId: { toString: () => "some-other-turf" } }]));

    await expect(
      createManualBooking("owner1", { turfId: "turf1", customerId: "507f1f77bcf86cd799439011", slotIds: ["slot1"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when no slots are provided", async () => {
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: { toString: () => "owner1" } }));

    await expect(
      createManualBooking("owner1", { turfId: "turf1", customerId: "507f1f77bcf86cd799439011", slotIds: [] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a malformed customerId before ever touching the turf/slots", async () => {
    // Regression guard: lockSlot's atomic update is an aggregation-pipeline
    // update, which skips Mongoose's normal schema casting on $set values —
    // a plain string userId gets stored as a raw string in the ObjectId
    // `lockedBy` field, so confirmSlot's later cast-to-ObjectId query never
    // matches it and every manual booking fails at the confirm step with the
    // slot stuck LOCKED. Catching a non-ObjectId customerId here up front is
    // what makes that failure mode a clean 400 instead of a silent stuck lock.
    await expect(
      createManualBooking("owner1", { turfId: "turf1", customerId: "not-an-object-id", slotIds: ["slot1"] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(Turf.findById).not.toHaveBeenCalled();
  });
});

describe("markBookingPaidOut (admin settles an owner's pending commission-split payout)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid method before touching the database", async () => {
    await expect(
      markBookingPaidOut("admin1", "booking1", { method: "CRYPTO" })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(Booking.findById).not.toHaveBeenCalled();
  });

  it("rejects a booking with no pending payout (already PAID, VOID, or never PENDING)", async () => {
    Booking.findById.mockResolvedValue({ _id: "booking1", payoutStatus: "PAID" });
    await expect(
      markBookingPaidOut("admin1", "booking1", { method: "UPI" })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(Payout.create).not.toHaveBeenCalled();
  });

  it("creates a Payout and flips the booking PENDING -> PAID on the happy path", async () => {
    Booking.findById.mockResolvedValue({
      _id: "booking1",
      turfId: "turf1",
      payoutStatus: "PENDING",
      ownerAmountPaise: 45000,
    });
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: "owner1" }));
    Payout.create.mockResolvedValue({ _id: "payout1", amountPaise: 45000, ownerId: "owner1" });
    Booking.findOneAndUpdate.mockResolvedValue({ _id: "booking1", payoutStatus: "PAID", payoutId: "payout1" });

    const result = await markBookingPaidOut("admin1", "booking1", { method: "UPI", note: "utr-123" });

    expect(Payout.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner1", bookingIds: ["booking1"], amountPaise: 45000, method: "UPI", note: "utr-123", paidBy: "admin1" })
    );
    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "booking1", payoutStatus: "PENDING" },
      expect.objectContaining({ payoutStatus: "PAID", payoutId: "payout1" }),
      { new: true }
    );
    expect(result).toMatchObject({ payoutStatus: "PAID" });
  });

  it("rolls back the just-created Payout if a concurrent settlement wins the atomic claim first", async () => {
    Booking.findById.mockResolvedValue({
      _id: "booking1",
      turfId: "turf1",
      payoutStatus: "PENDING",
      ownerAmountPaise: 45000,
    });
    Turf.findById.mockReturnValue(withSelectNoLean({ ownerId: "owner1" }));
    Payout.create.mockResolvedValue({ _id: "payout1", amountPaise: 45000, ownerId: "owner1" });
    Booking.findOneAndUpdate.mockResolvedValue(null); // lost the race

    await expect(
      markBookingPaidOut("admin1", "booking1", { method: "UPI" })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(Payout.findByIdAndDelete).toHaveBeenCalledWith("payout1");
  });
});
