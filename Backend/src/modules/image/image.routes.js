import { Router } from "express";
import { uploadImage, serveImage, deleteImage, listMyImages } from "./image.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";
import { uploadSingleImage } from "./image.upload.js";

const router = Router();

// Uploads write megabytes into the database and cost real work to parse, so
// they get a tighter budget than ordinary reads.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many uploads — please wait a few minutes before uploading more images",
});

// GET /api/images/:id — public, serves the bytes
router.get("/:id", serveImage);

// GET /api/images — owner's own uploads (metadata only)
router.get("/", protect, authorize("OWNER", "ADMIN"), listMyImages);

// POST /api/images — owner uploads one image (multipart, field name "image")
router.post("/", protect, authorize("OWNER"), uploadLimiter, uploadSingleImage, uploadImage);

// DELETE /api/images/:id — uploader or admin
router.delete("/:id", protect, authorize("OWNER", "ADMIN"), deleteImage);

export default router;
