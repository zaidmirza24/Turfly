import mongoose from "mongoose";
import Image from "./image.model.js";
import ApiError from "../../common/utils/ApiError.js";
import logger from "../../common/utils/logger.js";
import env from "../../common/config/env.js";
import { detectImageType } from "./image.validation.js";

/** Maximum images that may be attached to a single turf. */
export const MAX_IMAGES_PER_TURF = 6;

/**
 * How long an uploaded-but-unattached image survives.
 *
 * Long enough that an owner can upload photos, get interrupted, and come back
 * to finish the form; short enough that abandoned uploads don't accumulate.
 * Enforced by the TTL index on Image.expiresAt — see image.model.js.
 */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

const orphanExpiry = () => new Date(Date.now() + ORPHAN_TTL_MS);

/** The public path an image is served from. This is what gets stored on a turf. */
export const imageUrl = (id) => `/api/images/${id}`;

/**
 * Extracts the image id from a stored URL. Returns null for anything that
 * isn't one of our own image paths — which is how externally-supplied URLs are
 * kept out of turf documents (see assertOwnedImageUrls).
 */
export const imageIdFromUrl = (url) => {
  if (typeof url !== "string") return null;
  const match = url.match(/^\/api\/images\/([a-f\d]{24})$/i);
  if (!match) return null;
  return mongoose.isValidObjectId(match[1]) ? match[1] : null;
};

/**
 * Store an uploaded file.
 *
 * `contentType` is derived from the bytes, not from what the client claimed —
 * see image.validation.js.
 */
export const createImage = async (ownerId, file) => {
  if (!file || !file.buffer) {
    throw new ApiError(400, "No file was uploaded");
  }

  // Multer's own limit should have rejected this already; re-checking here
  // means the rule still holds if this service is ever called from another
  // path (a seed script, a future bulk import).
  if (file.size > env.MAX_IMAGE_BYTES) {
    throw new ApiError(400, `Images must be ${Math.round(env.MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller`);
  }

  const contentType = detectImageType(file.buffer);

  const image = await Image.create({
    data: file.buffer,
    contentType,
    size: file.size,
    ownerId,
    // Every upload arrives already scheduled for deletion. Attaching it to a
    // turf is what makes it permanent — so an abandoned form cleans up after
    // itself with no job to run and nothing to remember.
    expiresAt: orphanExpiry(),
  });

  logger.info("Image uploaded", {
    imageId: image._id.toString(),
    contentType,
    size: file.size,
    // The client's claimed type is recorded only when it disagreed with the
    // bytes — a persistent mismatch is worth noticing.
    ...(file.mimetype !== contentType ? { claimedType: file.mimetype } : {}),
  });

  return { _id: image._id, url: imageUrl(image._id), contentType, size: image.size };
};

/** Fetch an image's bytes for serving. */
export const getImageData = async (imageId) => {
  const image = await Image.findById(imageId).select("+data contentType size updatedAt").lean();
  if (!image) {
    throw new ApiError(404, "Image not found");
  }
  return image;
};

/**
 * Validate that every URL in `urls` is one of our image paths *and* belongs to
 * `ownerId`, then mark those images as attached to `turfId`.
 *
 * This is the gate that stops a turf's image list becoming an arbitrary
 * string field: without it an owner could PATCH `images: ["https://…"]` and
 * have the platform render a third-party (or tracking, or offensive) URL to
 * every visitor, and could reference another owner's uploads.
 *
 * Returns the normalised URL list to persist.
 */
export const attachImagesToTurf = async (ownerId, turfId, urls) => {
  if (!Array.isArray(urls)) {
    throw new ApiError(400, "images must be an array");
  }

  // De-duplicate while preserving the owner's chosen order (the first image is
  // the one shown on cards and listings).
  const ids = [];
  for (const url of urls) {
    const id = imageIdFromUrl(url);
    if (!id) {
      throw new ApiError(400, "Images must be uploaded through this site before they can be used");
    }
    if (!ids.includes(id)) ids.push(id);
  }

  // Counted after de-duplication: the same photo listed six times is one
  // photo, and rejecting that would refuse a request that ends up well inside
  // the limit.
  if (ids.length > MAX_IMAGES_PER_TURF) {
    throw new ApiError(400, `A turf can have at most ${MAX_IMAGES_PER_TURF} images`);
  }

  if (ids.length > 0) {
    const owned = await Image.find({ _id: { $in: ids }, ownerId }).select("_id").lean();
    if (owned.length !== ids.length) {
      throw new ApiError(403, "One or more images don't exist or don't belong to you");
    }

    // Clearing expiresAt takes these out of the TTL monitor's reach: an image
    // on a live listing must never disappear underneath it.
    await Image.updateMany(
      { _id: { $in: ids }, ownerId },
      { $set: { turfId }, $unset: { expiresAt: "" } }
    );
  }

  // Runs even when `ids` is empty — clearing every photo off a turf is exactly
  // the case that orphans images, and an early return here would leave all of
  // them stored forever with no expiry.
  await rearmDetachedImages(ownerId, turfId, ids);

  return ids.map(imageUrl);
};

/**
 * Re-arms the TTL on images this turf just dropped.
 *
 * Without this, removing a photo from a listing would leave the binary stored
 * indefinitely with nothing pointing at it — the exact leak the expiry exists
 * to prevent, reintroduced through the edit path instead of the create path.
 */
const rearmDetachedImages = async (ownerId, turfId, keptIds) => {
  const { default: Turf } = await import("../turf/turf.model.js");

  const detached = await Image.find({
    ownerId,
    turfId,
    _id: { $nin: keptIds },
    expiresAt: null,
  })
    .select("_id")
    .lean();

  if (detached.length === 0) return;

  // An image may legitimately appear on more than one of this owner's turfs;
  // only the ones nothing references any more should start expiring.
  //
  // The turf being edited is excluded deliberately: this runs before its new
  // image list is written, so querying it would read the *old* list and every
  // image would look like it was still in use — which silently disabled the
  // whole re-arm. Its future contents are already known: `keptIds`.
  const stillUsed = await Turf.find({
    _id: { $ne: turfId },
    ownerId,
    images: { $in: detached.map((img) => imageUrl(img._id)) },
  })
    .select("images")
    .lean();

  const referenced = new Set(stillUsed.flatMap((t) => t.images ?? []));
  const toExpire = detached.filter((img) => !referenced.has(imageUrl(img._id))).map((img) => img._id);

  if (toExpire.length === 0) return;

  await Image.updateMany({ _id: { $in: toExpire } }, { $set: { expiresAt: orphanExpiry(), turfId: null } });
  logger.info("Detached images re-armed for expiry", { count: toExpire.length });
};

/**
 * Delete an image. Only the uploader (or an admin) may do so.
 *
 * The turf's `images` array is cleaned up in the same call — leaving the URL
 * behind would render a broken image for every visitor.
 */
export const deleteImage = async (user, imageId) => {
  const image = await Image.findById(imageId).select("ownerId turfId");
  if (!image) {
    throw new ApiError(404, "Image not found");
  }
  if (user.role !== "ADMIN" && image.ownerId.toString() !== user._id.toString()) {
    throw new ApiError(403, "You can only delete your own images");
  }

  // Import here rather than at module scope: turf.service imports nothing from
  // this module, but keeping the dependency one-directional at load time
  // avoids any chance of a cycle as both modules grow.
  const { default: Turf } = await import("../turf/turf.model.js");

  // Every turf holding this URL, not just `image.turfId`. That field records
  // only the most recent attachment, so an image reused across two of an
  // owner's turfs would leave a dangling URL — and a permanently broken image
  // — on the older one.
  const url = imageUrl(imageId);
  const { modifiedCount } = await Turf.updateMany({ images: url }, { $pull: { images: url } });

  await image.deleteOne();
  logger.info("Image deleted", { imageId: String(imageId), turfsUpdated: modifiedCount });
};

/**
 * Validate ownership of a set of uploaded images and clear their expiry.
 *
 * Shared by avatar and review-photo attachment — both are simpler than
 * turf.images's attachImagesToTurf: neither needs the cross-document
 * "is this image still used elsewhere" check turf photos do, because an
 * avatar or a review's photos are only ever referenced from that one
 * document. Callers are responsible for re-arming expiry on whatever URLs
 * they replace (see rearmImagesByUrl below).
 */
const verifyAndClaimImages = async (ownerId, urls, max) => {
  if (!Array.isArray(urls)) {
    throw new ApiError(400, "images must be an array");
  }

  const ids = [];
  for (const url of urls) {
    const id = imageIdFromUrl(url);
    if (!id) {
      throw new ApiError(400, "Images must be uploaded through this site before they can be used");
    }
    if (!ids.includes(id)) ids.push(id);
  }

  if (ids.length > max) {
    throw new ApiError(400, `At most ${max} image${max > 1 ? "s" : ""} allowed here`);
  }

  if (ids.length > 0) {
    const owned = await Image.find({ _id: { $in: ids }, ownerId }).select("_id").lean();
    if (owned.length !== ids.length) {
      throw new ApiError(403, "One or more images don't exist or don't belong to you");
    }
    await Image.updateMany({ _id: { $in: ids } }, { $unset: { expiresAt: "" } });
  }

  return ids.map(imageUrl);
};

/** A single avatar image (or none, if `url` is null/undefined). */
export const attachAvatarImage = async (userId, url) => {
  if (url === undefined || url === null) return url;
  const [claimed] = await verifyAndClaimImages(userId, [url], 1);
  return claimed;
};

const MAX_IMAGES_PER_REVIEW = 4;

/** Up to `MAX_IMAGES_PER_REVIEW` photos a reviewer attaches to their review. */
export const attachReviewImages = async (userId, urls) => verifyAndClaimImages(userId, urls, MAX_IMAGES_PER_REVIEW);

/**
 * Re-arms expiry on images a document no longer references (an avatar just
 * replaced, or photos removed from a review edit) — otherwise they'd be
 * "attached" (expiresAt cleared) forever with nothing pointing at them.
 */
export const rearmImagesByUrl = async (urls) => {
  const ids = (urls ?? []).map(imageIdFromUrl).filter(Boolean);
  if (ids.length === 0) return;
  await Image.updateMany({ _id: { $in: ids } }, { $set: { expiresAt: orphanExpiry() } });
};

/** Images uploaded by this owner, newest first (metadata only — no binaries). */
export const listOwnerImages = async (ownerId, { turfId } = {}) => {
  const filter = { ownerId };
  if (turfId) filter.turfId = turfId;

  const images = await Image.find(filter).select("contentType size turfId createdAt").sort({ createdAt: -1 }).lean();

  return images.map((img) => ({ ...img, url: imageUrl(img._id) }));
};

/**
 * One-off sweep for unattached uploads.
 *
 * Routine cleanup does NOT go through here — the TTL index on `expiresAt`
 * handles that continuously (see image.model.js). This exists for the two
 * cases a TTL index can't cover by itself:
 *
 *  1. Backfill: documents created before `expiresAt` existed carry no expiry,
 *     so the TTL monitor will never look at them.
 *  2. Operations: deleting abandoned uploads now rather than waiting out the
 *     remaining TTL.
 *
 * Run it with `npm run images:prune`. It arms missing expiries rather than
 * deleting outright, so anything it touches still gets the full grace period
 * — an owner mid-upload never loses a file to a maintenance command.
 */
export const pruneOrphanedImages = async ({ olderThanMs = ORPHAN_TTL_MS } = {}) => {
  const cutoff = new Date(Date.now() - olderThanMs);

  const result = await Image.updateMany(
    { turfId: null, expiresAt: null, createdAt: { $lt: cutoff } },
    { $set: { expiresAt: orphanExpiry() } }
  );

  if (result.modifiedCount > 0) {
    logger.info("Armed expiry on orphaned images", { armed: result.modifiedCount });
  }
  return result.modifiedCount;
};
