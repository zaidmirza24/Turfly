import ApiError from "../../common/utils/ApiError.js";

/**
 * Content sniffing for uploaded images.
 *
 * The multipart `Content-Type` and the filename extension are both supplied by
 * the client and mean nothing on their own — a PHP script or an HTML file
 * carrying XSS renamed to `photo.jpg` arrives with `image/jpeg` attached. The
 * only trustworthy signal is the bytes, so the real format is derived from the
 * file's magic number and the client's claim is discarded.
 */

const SIGNATURES = [
  {
    contentType: "image/jpeg",
    // FF D8 FF — every JPEG variant (JFIF, EXIF, raw) starts with this.
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: "image/png",
    // \x89PNG\r\n\x1a\n
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    contentType: "image/webp",
    // "RIFF" ....  "WEBP"
    test: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

/** MIME types the client is allowed to claim, checked before the bytes are read. */
export const ACCEPTED_MIME_TYPES = SIGNATURES.map((s) => s.contentType);

/** Human-readable list for error messages and UI copy. */
export const ACCEPTED_LABEL = "JPEG, PNG or WebP";

/**
 * SVG deserves an explicit mention: it is an image format, but it is also a
 * document format that executes script when served inline. It is not in the
 * allow-list, and this catches the case where one slips past a client-side
 * filter, so the rejection message can say why.
 */
const looksLikeSvgOrMarkup = (buffer) => {
  const head = buffer.toString("ascii", 0, Math.min(buffer.length, 256)).trim().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype") || head.startsWith("<html");
};

/**
 * Validates an uploaded buffer and returns the content type derived from its
 * bytes. Throws ApiError on anything that isn't a supported raster image.
 */
export const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, "The uploaded file is empty");
  }

  const match = SIGNATURES.find((sig) => sig.test(buffer));
  if (match) return match.contentType;

  if (looksLikeSvgOrMarkup(buffer)) {
    throw new ApiError(
      400,
      `SVG and HTML files aren't accepted because they can carry scripts. Upload a ${ACCEPTED_LABEL} image instead.`
    );
  }

  throw new ApiError(400, `That file isn't a ${ACCEPTED_LABEL} image`);
};
