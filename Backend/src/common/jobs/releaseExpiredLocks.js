import Slot from "../../modules/slot/slot.model.js";

/**
 * Releases any slot that is LOCKED but whose lockExpiresAt has passed,
 * setting it back to AVAILABLE. Shared by:
 *  - the local node-cron job (src/common/jobs/slotCleanup.js), and
 *  - the /api/cron/slot-cleanup HTTP route, which Vercel Cron invokes
 *    (node-cron doesn't run on serverless — there's no long-lived process
 *    for it to schedule inside).
 */
export const releaseExpiredLocks = async () => {
  const now = new Date();

  const result = await Slot.updateMany(
    {
      status: "LOCKED",
      lockExpiresAt: { $lt: now },
    },
    {
      status: "AVAILABLE",
      lockedBy: null,
      lockExpiresAt: null,
    }
  );

  return result.modifiedCount;
};
