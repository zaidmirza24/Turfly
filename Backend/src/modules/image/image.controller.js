import * as imageService from "./image.service.js";
import ApiResponse from "../../common/utils/ApiResponse.js";

export const uploadImage = async (req, res) => {
  const image = await imageService.createImage(req.user._id, req.file);
  new ApiResponse(201, "Image uploaded successfully", image).send(res);
};

/**
 * Serve an image's bytes.
 *
 * Public: turf photos appear on the public listing, so requiring a token here
 * would mean the browser could never render them from an <img> tag. The id is
 * an unguessable ObjectId and the content is a venue photo the owner chose to
 * publish.
 */
export const serveImage = async (req, res) => {
  const image = await imageService.getImageData(req.params.id);

  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Content-Length", image.size);
  // The bytes at a given id never change — an edit produces a new id — so this
  // can be cached hard. Without it every card render re-fetches the binary
  // from MongoDB.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  // Defence in depth for the one route that returns caller-supplied bytes:
  // stop a browser from ever interpreting the response as anything but the
  // declared image type, and forbid it being framed or run as script.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", "inline");
  // Overrides the app-wide `same-site` default. The frontend is deployed on a
  // different origin from the API, and an <img> tag is a cross-origin
  // embed — under `same-site` the browser refuses to render it and every turf
  // photo silently becomes a broken image.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  res.end(image.data.buffer ? Buffer.from(image.data.buffer) : image.data);
};

export const deleteImage = async (req, res) => {
  await imageService.deleteImage(req.user, req.params.id);
  new ApiResponse(200, "Image deleted successfully").send(res);
};

export const listMyImages = async (req, res) => {
  const images = await imageService.listOwnerImages(req.user._id, { turfId: req.query.turfId });
  new ApiResponse(200, "Images fetched successfully", images).send(res);
};
