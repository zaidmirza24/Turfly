import { Router } from "express";
import env from "../../common/config/env.js";
import ApiError from "../../common/utils/ApiError.js";
import ApiResponse from "../../common/utils/ApiResponse.js";
import { releaseExpiredLocks } from "../../common/jobs/releaseExpiredLocks.js";

const router = Router();

/**
 * GET /api/cron/slot-cleanup — invoked by Vercel Cron (see vercel.json).
 * Vercel Cron sends its requests as GET with `Authorization: Bearer $CRON_SECRET`
 * when a CRON_SECRET env var is configured, so we verify that same secret here
 * to stop this route being triggered by anyone else who finds the URL.
 * If CRON_SECRET isn't set (e.g. local testing) the check is skipped.
 */
router.get("/slot-cleanup", async (req, res) => {
  if (env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      throw new ApiError(401, "Unauthorized");
    }
  }

  const released = await releaseExpiredLocks();
  new ApiResponse(200, `Released ${released} expired slot lock(s)`, { released }).send(res);
});

export default router;
