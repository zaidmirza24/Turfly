import mongoose from "mongoose";
import connectDB from "../src/common/config/db.js";
import logger from "../src/common/utils/logger.js";
import { pruneOrphanedImages } from "../src/modules/image/image.service.js";

/**
 * Manual sweep for unattached image uploads.
 *
 * Every upload is stored with an `expiresAt`; deleting the master also means
 * calling ImageKit's delete API, which nothing but this sweep (or the
 * equivalent POST /api/images/jobs/prune-orphans endpoint) ever does — there
 * is no MongoDB TTL index doing this in the background (see
 * src/modules/image/image.model.js for why).
 *
 * Run this on a schedule (e.g. via the same external cron that triggers
 * booking reminders) — each run arms expiry on newly-old orphans and purges
 * (ImageKit delete + Mongo delete) any whose expiry has already passed.
 * Idempotent: safe to run more often than needed.
 *
 *   npm run images:prune
 */
const run = async () => {
  await connectDB();

  const { armed, purged } = await pruneOrphanedImages();

  logger.info("Image prune complete", { armed, purged });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error("Image prune failed", { err: error });
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
