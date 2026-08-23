import mongoose from "mongoose";

/**
 * Metadata for an uploaded image whose bytes live on ImageKit.
 *
 * The master file is stored at full quality on ImageKit; nothing here ever
 * holds pixel data. Every consumer renders a *transformed* variant built at
 * request time (see image.controller.js / image.service.js buildDeliveryUrl)
 * so a card thumbnail, a gallery image and a fullscreen view all come from
 * the same untouched original — re-cropping or re-encoding for a new layout
 * never requires a re-upload.
 */
const imageSchema = new mongoose.Schema(
  {
    /** ImageKit's internal file id — needed to delete the master later. */
    fileId: {
      type: String,
      required: true,
    },
    /**
     * Path within the ImageKit media library (e.g. "/turf-app/<ownerId>/xyz.jpg").
     * Combined with IMAGEKIT_URL_ENDPOINT + a transformation string to build
     * the URL an <img> tag actually loads.
     */
    filePath: {
      type: String,
      required: true,
    },
    /** ImageKit's own delivery URL for the untransformed master. */
    url: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    /** Original upload size in bytes (the master, not any transformed variant). */
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
     * stored file that nothing references. Rather than schedule a job to hunt
     * for them, each upload arrives already carrying its own expiry, and the
     * expiry is removed the moment the image is attached to a turf (see
     * attachImagesToTurf/rearmDetachedImages in image.service.js).
     *
     * Unlike the old Mongo-blob storage, deleting the *master* also means
     * calling ImageKit's delete API — something a MongoDB TTL index can't do
     * on its own. So this field is a marker only: the actual purge (ImageKit
     * delete + Mongo delete) runs from pruneOrphanedImages, invoked by the
     * `images:prune` script or the protected /api/images/jobs/prune-orphans
     * endpoint, the same external-cron pattern used for booking reminders.
     */
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

const Image = mongoose.model("Image", imageSchema);
export default Image;
