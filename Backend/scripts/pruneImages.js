import mongoose from "mongoose";
import connectDB from "../src/common/config/db.js";
import logger from "../src/common/utils/logger.js";
import { pruneOrphanedImages } from "../src/modules/image/image.service.js";

/**
 * Manual sweep for unattached image uploads.
 *
 * Routine cleanup needs nothing run: every upload is stored with an
 * `expiresAt`, and MongoDB's TTL monitor removes it if it is never attached to
 * a turf (see src/modules/image/image.model.js).
 *
 * This command exists for the gap a TTL index can't close on its own —
 * documents written before `expiresAt` existed carry no expiry, so the TTL
 * monitor will never consider them. Running this once after deploying arms
 * them; after that there is nothing to schedule.
 *
 * It sets an expiry rather than deleting, so anything it touches still gets
 * the full grace period and an owner mid-upload can't lose a file to it.
 *
 *   npm run images:prune
 */
const run = async () => {
  await connectDB();

  const armed = await pruneOrphanedImages();

  logger.info("Image prune complete", {
    armed,
    note: armed > 0 ? "these will be removed by MongoDB's TTL monitor once their expiry passes" : "nothing to do",
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error("Image prune failed", { err: error });
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
