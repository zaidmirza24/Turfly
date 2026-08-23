const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Delivery variant to request from the backend. Maps to a fixed,
 * server-defined ImageKit transformation (see DELIVERY_VARIANTS in
 * Backend/src/modules/image/image.service.js) — never a raw width/height,
 * which would let the client force arbitrary billable transforms.
 *
 *  - card: turf cards / listing grids (~600px)
 *  - gallery: detail-page main image + thumbnail strip (~1200px)
 *  - full: fullscreen/lightbox viewing (~1920px)
 */
export type ImageSize = 'card' | 'gallery' | 'full';

/**
 * Resolves a stored image path to a URL the browser can load.
 *
 * Turf images are persisted as API-relative paths (`/api/images/<id>`), which
 * keeps them portable across environments — but the frontend is usually served
 * from a different origin than the API, so rendering the stored value directly
 * would ask the *frontend* host for it and return the SPA's index.html. This
 * re-bases the path onto whatever origin VITE_API_BASE_URL points at.
 *
 * `size`, when given, is appended as `?size=` so the backend redirects to the
 * matching ImageKit-transformed variant instead of the full master — omit it
 * to get the backend's default (gallery-sized) variant.
 *
 * Absolute URLs (the stock placeholder photos) pass through untouched.
 */
export function resolveImageUrl(path: string | undefined | null, size?: ImageSize): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;

  try {
    // VITE_API_BASE_URL includes the "/api" prefix, and so does the stored
    // path, so the base's origin is what we want to graft onto.
    const origin = new URL(API_BASE_URL, window.location.origin).origin;
    const query = size ? `?size=${size}` : '';
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}${query}`;
  } catch {
    return path;
  }
}

/** Placeholder used wherever a turf has no photo of its own yet. */
export const TURF_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800';

/** First image for a turf, sized for a card/listing grid, or the shared placeholder. */
export function turfCoverImage(images: string[] | undefined): string {
  return resolveImageUrl(images?.[0], 'card') ?? TURF_PLACEHOLDER_IMAGE;
}
