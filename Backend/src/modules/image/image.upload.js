import multer from "multer";
import env from "../../common/config/env.js";
import { ACCEPTED_MIME_TYPES } from "./image.validation.js";

/**
 * Multipart parsing for image uploads.
 *
 * memoryStorage, not diskStorage: the serverless targets this deploys to have
 * no writable persistent filesystem, and the buffer goes straight into MongoDB
 * anyway — a temp file would only add a cleanup path that leaks on every early
 * return. The size limit below is what keeps "in memory" safe.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_IMAGE_BYTES,
    files: 1,
    // Multipart bodies can also carry text fields; none are expected here, and
    // an unbounded field count is a cheap way to make the parser do work.
    fields: 2,
    parts: 4,
  },
  fileFilter: (_req, file, cb) => {
    // A cheap first pass so an obviously wrong file is rejected before its
    // bytes are buffered. This is *not* the security control — the client
    // controls this header. The real check is the magic-number sniff in
    // image.validation.js, which runs on the stored bytes.
    if (!ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
      const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname);
      err.message = "Only JPEG, PNG and WebP images are accepted";
      return cb(err);
    }
    cb(null, true);
  },
});

/** Accepts a single file in the `image` field. */
export const uploadSingleImage = upload.single("image");

export default upload;
