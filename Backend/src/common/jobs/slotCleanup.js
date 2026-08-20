import cron from "node-cron";
import { releaseExpiredLocks } from "./releaseExpiredLocks.js";

/**
 * Background job to release expired locks — runs every minute.
 *
 * Only used for local/traditional (long-running process) hosting, started
 * from src/server.js. On Vercel there's no persistent process for node-cron
 * to schedule inside, so this is NOT called from the serverless entry point
 * (api/index.js) — Vercel Cron hits /api/cron/slot-cleanup instead, which
 * runs the same releaseExpiredLocks() logic.
 */
export const initSlotCleanupJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const count = await releaseExpiredLocks();

      if (count > 0) {
        console.log(`[SlotCleanup] Released ${count} expired slot locks.`);
      }
    } catch (error) {
      console.error("[SlotCleanup] Error during slot cleanup job:", error);
    }
  });

  console.log("[SlotCleanup] Slot cleanup job initialized (every 1 minute).");
};
