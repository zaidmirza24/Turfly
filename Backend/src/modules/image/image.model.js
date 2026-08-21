import mongoose from "mongoose";

/**
 * Uploaded image binary.
 *
 * Stored in MongoDB rather than on disk because every deployment target here
 * is serverless (Vercel), where the filesystem is ephemeral and read-only
 * outside /tmp — a file written during one request is gone by the next. Using
 * the database that is already provisioned also avoids adding an object-store
 * dependency and a second set of credentials to operate.
 *
 * The trade-off is deliberate and bounded: uploads are capped well below
 * MongoDB's 16 MB per-document limit, and `data` is `select: false` so a
 * listing query never drags binaries into memory. If image volume ever
 * outgrows this, the swap is confined to image.service.js — every consumer
 * only ever sees the `/api/images/:id` URL.
 */
const imageSchema = new mongoose.Schema(
  {
    data: {
      type: Buffer,
      required: true,
      // Never returned unless explicitly asked for. Without this, any populate
      // or find() on this collection would pull megabytes of binary per row.
      select: false,
    },
    contentType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Uploader. Only they (or an admin) may delete it. */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /**
     * Set once the image is attached to a turf, and holds the most recent
     * attachment only — an image may legitimately appear on more than one of
     * an owner's turfs. Deletion finds referencing turfs by URL rather than
     * trusting this field.
     */
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Turf",
      default: null,
      index: true,
    },
    /**
     * Self-destruct timestamp for an upload that was never attached to a turf.
     *
     * An upload happens the moment the owner picks a file, but the turf is only
     * saved when they submit the form — so every abandoned dialog leaves a
     * stored binary that nothing references. Rather than schedule a job to hunt
     * for them, each upload arrives already carrying its own expiry, and the
     * expiry is removed the moment the image is attached to a turf (see
     * armExpiry/disarmExpiry in image.service.js).
     *
     * The TTL index below is what enforces it. MongoDB's own background monitor
     * removes expired documents roughly once a minute, with no cron entry, no
     * HTTP endpoint to secure, and no dependence on the app receiving traffic.
     * A document whose `expiresAt` is unset is simply never considered — which
     * is exactly the "attached images live forever" rule we want.
     */
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// expireAfterSeconds: 0 means "delete when `expiresAt` is reached" (rather than
// N seconds after it). Documents missing the field, or holding null, are
// ignored by the TTL monitor entirely.
imageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Image = mongoose.model("Image", imageSchema);
export default Image;
