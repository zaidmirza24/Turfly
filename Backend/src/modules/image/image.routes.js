import { Router } from "express";
import { uploadImage, serveImage, deleteImage, listMyImages } from "./image.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";
import { uploadSingleImage } from "./image.upload.js";
import { pruneOrphanedImages } from "./image.service.js";
import env from "../../common/config/env.js";
import logger from "../../common/utils/logger.js";
import safeEqual from "../../common/utils/safeEqual.js";

const router = Router();

// Uploads cost real work to parse and forward to ImageKit, so they get a
// tighter budget than ordinary reads.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many uploads — please wait a few minutes before uploading more images",
});

// GET /api/images/:id — public, redirects to the ImageKit-delivered variant
router.get("/:id", serveImage);

// GET /api/images — owner's own uploads (metadata only)
router.get("/", protect, authorize("OWNER", "ADMIN"), listMyImages);

// POST /api/images — owner uploads one image (multipart, field name "image")
router.post("/", protect, authorize("OWNER"), uploadLimiter, uploadSingleImage, uploadImage);

// DELETE /api/images/:id — uploader or admin
router.delete("/:id", protect, authorize("OWNER", "ADMIN"), deleteImage);

/**
 * Meant to be invoked by an external scheduler (Vercel Cron, cron-job.org,
 * etc), not by any traffic inside this app — same pattern as
 * notification.routes.js's /jobs/send-reminders (see ai-context.md:
 * "Recurring work without a scheduler"). Purging an orphaned master requires
 * calling ImageKit's delete API, which a MongoDB TTL index can't do, so this
 * (or `npm run images:prune`) is the only thing that ever removes them.
 *
 * Safe to invoke more often than needed — it only ever touches images with no
 * turfId, and re-running it after a partial failure just retries the same
 * work.
 */
router.post("/jobs/prune-orphans", async (req, res) => {
  if (!env.CRON_SECRET || !safeEqual(req.headers["x-cron-secret"], env.CRON_SECRET)) {
    return res.status(404).end();
  }

  const result = await pruneOrphanedImages();
  logger.info("Orphaned image prune job ran", result);
  res.status(200).json(result);
});

export default router;
