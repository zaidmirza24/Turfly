import logger from "../../common/utils/logger.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 4000;

/**
 * Best-effort free-text → [lng, lat] lookup via OpenStreetMap's Nominatim,
 * used so an owner never has to find their own coordinates. Deliberately
 * fire-and-forget from the caller's perspective: geocoding is not core to
 * listing a turf, so a slow/unreachable/no-match response must never block
 * or fail turf create/update — it just means that turf can't power distance
 * sort, "nearby", or the map embed until an owner edit resolves it.
 *
 * Nominatim's usage policy requires a real identifying User-Agent and caps
 * at ~1 req/sec — fine for owner-driven create/update traffic, not for a
 * customer-facing search-as-you-type endpoint.
 */
export const geocodeLocation = async (locationText) => {
  if (!locationText || typeof locationText !== "string") return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(locationText)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TurfBookingApp/1.0 (contact: support@turf.app)" },
    });
    if (!res.ok) return undefined;

    const results = await res.json();
    const first = Array.isArray(results) ? results[0] : undefined;
    if (!first) return undefined;

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

    return { type: "Point", coordinates: [lng, lat] };
  } catch (err) {
    logger.warn("Geocoding lookup failed", { error: err.message, locationText });
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};
