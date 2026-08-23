import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./image.service.js", () => ({
  getImageForDelivery: vi.fn(),
  buildDeliveryUrl: vi.fn(),
}));

import * as imageService from "./image.service.js";
import { serveImage } from "./image.controller.js";

const makeRes = () => {
  const headers = {};
  return {
    headers,
    setHeader: (k, v) => {
      headers[k] = v;
    },
    redirect: vi.fn(),
  };
};

/**
 * The turf photo endpoint is the one response in this API that a *browser* has
 * to embed from another site: the deployed frontend and API are separate
 * `*.vercel.app` hosts, and because `vercel.app` is a public suffix those are
 * cross-site, not merely cross-origin. An <img> load is a no-CORS request, so
 * the CORS allow-list plays no part — Cross-Origin-Resource-Policy alone
 * decides, and the app-wide "same-site" default (app.js) makes Chrome discard
 * the response with ERR_BLOCKED_BY_RESPONSE.NotSameSite. It works on localhost
 * only because both dev servers are same-site, so this regresses invisibly.
 */
describe("serveImage", () => {
  beforeEach(() => {
    vi.mocked(imageService.getImageForDelivery).mockResolvedValue({ filePath: "/turf-app/1/a.jpg" });
    vi.mocked(imageService.buildDeliveryUrl).mockReturnValue("https://ik.imagekit.io/x/turf-app/1/a.jpg");
  });

  it("opts out of the app-wide same-site CORP so the frontend can embed it", async () => {
    const res = makeRes();

    await serveImage({ params: { id: "507f1f77bcf86cd799439011" }, query: {} }, res);

    expect(res.headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
  });

  it("redirects to the ImageKit variant for the requested size", async () => {
    const res = makeRes();

    await serveImage({ params: { id: "507f1f77bcf86cd799439011" }, query: { size: "card" } }, res);

    expect(imageService.buildDeliveryUrl).toHaveBeenCalledWith("/turf-app/1/a.jpg", "card");
    expect(res.redirect).toHaveBeenCalledWith(301, "https://ik.imagekit.io/x/turf-app/1/a.jpg");
  });
});
