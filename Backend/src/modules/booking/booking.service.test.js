import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./booking.model.js", () => ({
  default: { create: vi.fn(), findById: vi.fn() },
}));
vi.mock("../slot/slot.model.js", () => ({
  default: {
    findById: vi.fn(),
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

const { lockSlot, confirmSlot, cancelBooking } = await import("./booking.service.js");
const Slot = (await import("../slot/slot.model.js")).default;
const Turf = (await import("../turf/turf.model.js")).default;
const Booking = (await import("./booking.model.js")).default;
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
      price: 1200, // price changed by the owner after the hold was created
      lockedPrice: 800, // what the customer actually saw and agreed to
    });
    Booking.create.mockResolvedValue({ _id: "booking1", amount: 800 });
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await confirmSlot("user1", "slot1");

    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 800 }));
  });

  it("falls back to the slot's current price if no lockedPrice was captured", async () => {
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", turfId: "turf1", price: 900, lockedPrice: null });
    Booking.create.mockResolvedValue({ _id: "booking1", amount: 900 });
    Slot.findByIdAndUpdate.mockResolvedValue({});

    await confirmSlot("user1", "slot1");

    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 900 }));
  });

  it("rejects when the slot isn't locked by this user (lock expired or stolen)", async () => {
    Slot.findOneAndUpdate.mockResolvedValue(null);
    await expect(confirmSlot("user1", "slot1")).rejects.toMatchObject({ statusCode: 409 });
    expect(Booking.create).not.toHaveBeenCalled();
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
