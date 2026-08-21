import { describe, it, expect } from "vitest";
import { imageIdFromUrl, imageUrl } from "./image.service.js";

/**
 * imageIdFromUrl is the gate that keeps arbitrary URLs out of a turf's image
 * list: anything it can't resolve to one of our own image ids is refused by
 * attachImagesToTurf. If it ever accepted an external URL, an owner could have
 * the platform render third-party content — or a tracking pixel — to every
 * visitor of their listing.
 */
describe("imageIdFromUrl", () => {
  const id = "507f1f77bcf86cd799439011";

  it("accepts our own image paths", () => {
    expect(imageIdFromUrl(`/api/images/${id}`)).toBe(id);
    expect(imageIdFromUrl(imageUrl(id))).toBe(id);
  });

  it("is case-insensitive about the hex id", () => {
    expect(imageIdFromUrl("/api/images/507F1F77BCF86CD799439011")).toBe("507F1F77BCF86CD799439011");
  });

  it("rejects absolute URLs, including ones that embed a valid id", () => {
    expect(imageIdFromUrl(`https://evil.example/api/images/${id}`)).toBeNull();
    expect(imageIdFromUrl(`//evil.example/api/images/${id}`)).toBeNull();
    expect(imageIdFromUrl("https://images.unsplash.com/photo-123")).toBeNull();
  });

  it("rejects path traversal and suffixed paths", () => {
    expect(imageIdFromUrl(`/api/images/${id}/../../secret`)).toBeNull();
    expect(imageIdFromUrl(`/api/images/${id}?redirect=x`)).toBeNull();
    expect(imageIdFromUrl(`/api/images/${id}.png`)).toBeNull();
  });

  it("rejects ids that aren't ObjectIds", () => {
    expect(imageIdFromUrl("/api/images/not-an-id")).toBeNull();
    expect(imageIdFromUrl("/api/images/507f1f77bcf86cd7994390")).toBeNull(); // too short
  });

  it("rejects non-strings", () => {
    expect(imageIdFromUrl(undefined)).toBeNull();
    expect(imageIdFromUrl(null)).toBeNull();
    expect(imageIdFromUrl({ toString: () => `/api/images/${id}` })).toBeNull();
  });
});
