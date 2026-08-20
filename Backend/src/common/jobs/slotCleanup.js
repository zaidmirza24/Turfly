import cron from "node-cron";
import Slot from "../../modules/slot/slot.model.js";

/**
 * Background job to release expired locks.
 * Runs every minute.
 * Sets status to AVAILABLE for any slot that is LOCKED but has passed its lockExpiresAt.
 */
export const initSlotCleanupJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
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
      
      if (result.modifiedCount > 0) {
        console.log(`[SlotCleanup] Released ${result.modifiedCount} expired slot locks.`);
      }
    } catch (error) {
      console.error("[SlotCleanup] Error during slot cleanup job:", error);
    }
  });
  
  console.log("[SlotCleanup] Slot cleanup job initialized (every 1 minute).");
};
