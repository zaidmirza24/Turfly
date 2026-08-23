import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./booking.model.js", () => ({
  default: { create: vi.fn(), findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../slot/slot.model.js", () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock("../turf/turf.model.js", () => ({
  default: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("../turf/turf.service.js", () => ({
  isTurfBookable: vi.fn(() => true),
}));
vi.mock("../user/user.model.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../payment/payment.model.js", () => ({ default: { find: vi.fn() } }));

const {
  lockMultipleSlots,
  releaseCheckoutHold,
  lockSlot,
  forceCancelForSystem,
} = await import("./booking.service.js");
const Slot = (await import("../slot/slot.model.js")).default;
const Turf = (await import("../turf/turf.model.js")).default;
const Booking = (await import("./booking.model.js")).default;

const withSelect = (value) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });
const withSelectNoLean = (value) => ({ select: vi.fn().mockResolvedValue(value) });

describe("lockSlot (Section 6 — atomic single-slot race)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TC-6.1 — the atomic findOneAndUpdate filter only matches AVAILABLE or expired-LOCKED, so a concurrent winner locks out every other caller", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    Slot.countDocuments.mockResolvedValue(0);
    // Simulate the loser of the race: someone else's lock already won.
    Slot.findOneAndUpdate.mockResolvedValueOnce(null);
    Slot.findById.mockReturnValueOnce(withSelect({ turfId: "turf1" })).mockReturnValueOnce({
      startTime: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(lockSlot("userB", "slot1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("the atomic filter excludes any slot currently BOOKED or freshly LOCKED by someone else", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    Slot.countDocuments.mockResolvedValue(0);
    Slot.findOneAndUpdate.mockResolvedValue({ _id: "slot1", status: "LOCKED" });

    await lockSlot("userA", "slot1");

    const [filter] = Slot.findOneAndUpdate.mock.calls[0];
    expect(filter.$or).toEqual([
      { status: "AVAILABLE" },
      { status: "LOCKED", lockExpiresAt: { $lt: expect.any(Date) } },
    ]);
  });
});

describe("lockMultipleSlots (Section 6.4 — compensating rollback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TC-6.4 — releases every slot already locked in this request when a later slot in the batch fails", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    Slot.countDocuments.mockResolvedValue(0);

    // slot1 locks fine, slot2 loses the race (already taken).
    Slot.findOneAndUpdate
      .mockResolvedValueOnce({ _id: "slot1", status: "LOCKED" })
      .mockResolvedValueOnce(null);
    // lockSlot's failure-diagnosis re-fetch for slot2
    Slot.findById.mockReturnValueOnce(withSelect({ turfId: "turf1" })).mockReturnValueOnce(withSelect({ turfId: "turf1" })).mockReturnValueOnce({
      startTime: new Date(Date.now() + 60 * 60 * 1000),
    });
    Slot.findOneAndUpdate.mockResolvedValueOnce({}); // the compensating release call for slot1

    await expect(lockMultipleSlots("user1", ["slot1", "slot2"])).rejects.toMatchObject({ statusCode: 409 });

    // Last call should be the rollback releasing slot1 back to AVAILABLE.
    const rollbackCall = Slot.findOneAndUpdate.mock.calls.at(-1);
    expect(rollbackCall[0]).toMatchObject({ _id: "slot1", status: "LOCKED", lockedBy: "user1" });
    expect(rollbackCall[1]).toMatchObject({ status: "AVAILABLE", lockedBy: null });
  });

  it("never triggers a rollback when every slot in the batch locks successfully", async () => {
    Slot.findById.mockReturnValue(withSelect({ turfId: "turf1" }));
    Turf.findById.mockReturnValue(withSelectNoLean({ isActive: true, approvalStatus: "APPROVED" }));
    Slot.countDocuments.mockResolvedValue(0);
    Slot.findOneAndUpdate
      .mockResolvedValueOnce({ _id: "slot1", status: "LOCKED" })
      .mockResolvedValueOnce({ _id: "slot2", status: "LOCKED" });

    const result = await lockMultipleSlots("user1", ["slot1", "slot2"]);

    expect(result).toHaveLength(2);
    expect(Slot.findOneAndUpdate).toHaveBeenCalledTimes(2); // no third (rollback) call
  });
});

describe("releaseCheckoutHold (Section 2.2 — explicit hold release)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only releases slots still LOCKED by this exact user, scoped in the filter itself", async () => {
    Slot.updateMany.mockResolvedValue({ modifiedCount: 2 });
    await releaseCheckoutHold("user1", ["slot1", "slot2"]);

    expect(Slot.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["slot1", "slot2"] }, status: "LOCKED", lockedBy: "user1" },
      expect.objectContaining({ status: "AVAILABLE", lockedBy: null })
    );
  });

  it("rejects an empty slot list rather than silently no-op-ing on nothing", async () => {
    await expect(releaseCheckoutHold("user1", [])).rejects.toMatchObject({ statusCode: 400 });
    expect(Slot.updateMany).not.toHaveBeenCalled();
  });
});

describe("forceCancelForSystem (Section 6.2/6.3 — post-capture slot-loss rollback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("TC-6.2/6.3 — cancels the phantom booking and frees the slot regardless of the normal cutoff rules", async () => {
    const booking = {
      _id: "b1",
      status: "CONFIRMED",
      slotId: "slot1",
      save: vi.fn().mockResolvedValue(true),
    };
    Booking.findById.mockResolvedValue(booking);
    Slot.findByIdAndUpdate.mockResolvedValue({});

    const result = await forceCancelForSystem("b1", "Slot lost after payment — auto-refunded");

    expect(booking.status).toBe("CANCELLED");
    expect(booking.cancelledBy).toBe("SYSTEM");
    expect(Slot.findByIdAndUpdate).toHaveBeenCalledWith(
      "slot1",
      expect.objectContaining({ status: "AVAILABLE", bookingId: null })
    );
    expect(result).toBe(booking);
  });

  it("is idempotent — a second call on an already-cancelled booking is a no-op, not a double slot-release", async () => {
    const booking = { _id: "b1", status: "CANCELLED", slotId: "slot1", save: vi.fn() };
    Booking.findById.mockResolvedValue(booking);

    await forceCancelForSystem("b1", "already handled");

    expect(booking.save).not.toHaveBeenCalled();
    expect(Slot.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
