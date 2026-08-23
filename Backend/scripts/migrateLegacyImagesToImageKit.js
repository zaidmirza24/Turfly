import mongoose from "mongoose";
import connectDB from "../src/common/config/db.js";
import logger from "../src/common/utils/logger.js";
import imagekit from "../src/common/config/imagekit.js";

/**
 * One-off backfill for images uploaded before the ImageKit migration
 * (commit c51081f).
 *
 * Those documents still hold their original bytes in a `data` field that no
 * longer exists on the current Image schema — Mongoose won't read or write
 * it, so this talks to the raw `images` collection instead. For each legacy
 * doc it uploads the stored bytes to ImageKit and backfills fileId/filePath/
 * url, then removes `data` now that ImageKit is the source of truth. Without
 * this, GET /api/images/:id for these ids redirects to a malformed ImageKit
 * URL (see image.service.js buildDeliveryUrl) because filePath is undefined.
 *
 * Idempotent: only touches docs missing `fileId`, so re-running after a
 * partial failure just picks up where it left off.
 *
 *   node scripts/migrateLegacyImagesToImageKit.js
 */
const run = async () => {
  if (!imagekit) {
    throw new Error("ImageKit isn't configured (IMAGEKIT_PUBLIC_KEY missing) — nothing to migrate to");
  }

  await connectDB();
  const collection = mongoose.connection.collection("images");

  const legacy = await collection.find({ fileId: { $exists: false } }).toArray();
  logger.info("Legacy images found", { count: legacy.length });

  let migrated = 0;
  let failed = 0;

  for (const doc of legacy) {
    try {
      if (!doc.data) {
        logger.error("Legacy image has no data to migrate", { imageId: String(doc._id) });
        failed += 1;
        continue;
      }

      const buffer = doc.data.buffer ?? doc.data;
      const extension = (doc.contentType || "image/jpeg").split("/")[1];

      const uploaded = await imagekit.upload({
        file: buffer,
        fileName: `${doc._id}.${extension}`,
        folder: `/turf-app/${doc.ownerId}`,
        useUniqueFileName: false,
      });

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: { fileId: uploaded.fileId, filePath: uploaded.filePath, url: uploaded.url },
          $unset: { data: "" },
        }
      );

      migrated += 1;
      logger.info("Legacy image migrated", { imageId: String(doc._id), fileId: uploaded.fileId });
    } catch (error) {
      failed += 1;
      logger.error("Legacy image migration failed", { imageId: String(doc._id), err: error });
    }
  }

  logger.info("Legacy image migration complete", { migrated, failed, total: legacy.length });

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  logger.error("Legacy image migration script failed", { err: error });
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
