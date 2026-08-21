import { describe, it, expect } from "vitest";
import { detectImageType, ACCEPTED_MIME_TYPES } from "./image.validation.js";

/** Minimal buffers carrying each format's real magic number. */
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = () => Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 ", "ascii"),
]);

describe("detectImageType", () => {
  it("identifies the supported formats from their bytes", () => {
    expect(detectImageType(jpeg())).toBe("image/jpeg");
    expect(detectImageType(png())).toBe("image/png");
    expect(detectImageType(webp())).toBe("image/webp");
  });

  it("accepts exactly the advertised mime types", () => {
    expect(ACCEPTED_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("rejects a script renamed as an image", () => {
    // The whole point of sniffing: multer sees `image/jpeg` because the client
    // said so, and only the bytes give it away.
    const payload = Buffer.from("<?php system($_GET['c']); ?>", "utf8");
    expect(() => detectImageType(payload)).toThrow(/isn't a JPEG, PNG or WebP image/);
  });

  it("rejects SVG with an explanation, since it can carry script", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
    expect(() => detectImageType(svg)).toThrow(/can carry scripts/);
  });

  it("rejects HTML disguised as an image", () => {
    const html = Buffer.from("<!DOCTYPE html><html><body>hi</body></html>", "utf8");
    expect(() => detectImageType(html)).toThrow(/can carry scripts/);
  });

  it("rejects an empty upload", () => {
    expect(() => detectImageType(Buffer.alloc(0))).toThrow(/empty/);
    expect(() => detectImageType(undefined)).toThrow(/empty/);
  });

  it("rejects a truncated file that only starts like a PNG", () => {
    expect(() => detectImageType(Buffer.from([0x89, 0x50]))).toThrow();
  });

  it("throws with a 400 status so it surfaces as a client error", () => {
    expect.assertions(1);
    try {
      detectImageType(Buffer.from("nope", "utf8"));
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });
});
