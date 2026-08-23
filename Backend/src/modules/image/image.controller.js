import * as imageService from "./image.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const uploadImage = async (req, res) => {
  const image = await imageService.createImage(req.user._id, req.file);
  new ApiResponse(201, "Image uploaded successfully", image).send(res);
};

/**
 * Redirect to the ImageKit-delivered variant of an image.
 *
 * Public: turf photos appear on the public listing, so requiring a token here
 * would mean the browser could never render them from an <img> tag. The id is
 * an unguessable ObjectId and the content is a venue photo the owner chose to
 * publish.
 *
 * `?size=card|gallery|full` picks a fixed, server-defined transformation
 * (see DELIVERY_VARIANTS in image.service.js) — never client-supplied
 * dimensions, which would let anyone force arbitrary billable transforms.
 *
 * A 301 rather than 302: the bytes at a given id+size never change (an edit
 * produces a new id), so browsers are free to cache the redirect target
 * itself and skip this hop entirely on repeat views.
 */
export const serveImage = async (req, res) => {
  const image = await imageService.getImageForDelivery(req.params.id);
  const deliveryUrl = imageService.buildDeliveryUrl(image.filePath, req.query.size);

  // Overrides the app-wide "same-site" default (app.js): these are public venue
  // photos whose entire purpose is to be embedded by the frontend, which is a
  // *different site* in production — `vercel.app` is on the Public Suffix List,
  // so turfly.vercel.app and turfly-api-chi.vercel.app are cross-site, not just
  // cross-origin. An <img> is a no-CORS request, so CORS headers don't apply;
  // Cross-Origin-Resource-Policy is what decides, and "same-site" makes the
  // browser drop the response (ERR_BLOCKED_BY_RESPONSE.NotSameSite). Locally
  // both sides are localhost — same-site — which is why this only breaks
  // deployed.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.redirect(301, deliveryUrl);
};

export const deleteImage = async (req, res) => {
  await imageService.deleteImage(req.user, req.params.id);
  new ApiResponse(200, "Image deleted successfully").send(res);
};

export const listMyImages = async (req, res) => {
  const images = await imageService.listOwnerImages(req.user._id, { turfId: req.query.turfId });
  new ApiResponse(200, "Images fetched successfully", images).send(res);
};
