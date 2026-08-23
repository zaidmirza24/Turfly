import Slot from "../../modules/slot/slot.model.js";

/**
 * Releases slots that are LOCKED but whose lockExpiresAt has passed, setting
 * them back to AVAILABLE.
 *
 * There is no scheduler behind this. Lock expiry is handled by two mechanisms
 * that need no job to run at all:
 *
 *  1. **Correctness** — `lockSlot` matches `{ status: "LOCKED", lockExpiresAt:
 *     { $lt: now } }` as part of its atomic findOneAndUpdate, so an expired
 *     lock is immediately re-lockable by the next customer whether or not it
 *     has been swept. A lock never blocks a booking past its expiry, even if
 *     this function is never called.
 *
 *  2. **Display** — this sweep runs on the slot read path, so the grid a
 *     customer is looking at never shows a stale "LOCKED" that is actually
 *     bookable. A slot nobody is looking at doesn't need correcting, and the
 *     act of looking is what corrects it.
 *
 * `turfId` scopes the sweep to the turf being read. Without it every public
 * slot query fires a collection-wide updateMany — work proportional to the
 * whole platform on behalf of one visitor looking at one venue.
 */
export const releaseExpiredLocks = async ({ turfId } = {}) => {
  const now = new Date();

  const filter = {
    status: "LOCKED",
    lockExpiresAt: { $lt: now },
  };
  if (turfId) filter.turfId = turfId;

  const result = await Slot.updateMany(filter, {
    status: "AVAILABLE",
    lockedBy: null,
    lockExpiresAt: null,
    lockedPricePaise: null,
  });

  return result.modifiedCount;
};
