import { describe, it, expect } from 'vitest';
import { resolveImageUrl, turfCoverImage, TURF_PLACEHOLDER_IMAGE } from './imageUrl';

// vitest resolves VITE_API_BASE_URL from .env; the tests assert against the
// same default the app falls back to.
const API_ORIGIN = new URL(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').origin;

describe('resolveImageUrl', () => {
  it('re-bases a stored API path onto the API origin', () => {
    // The frontend is served from a different origin than the API, so the
    // stored relative path would otherwise resolve against the SPA host and
    // return index.html instead of an image.
    expect(resolveImageUrl('/api/images/507f1f77bcf86cd799439011')).toBe(
      `${API_ORIGIN}/api/images/507f1f77bcf86cd799439011`
    );
  });

  it('leaves absolute URLs alone', () => {
    expect(resolveImageUrl(TURF_PLACEHOLDER_IMAGE)).toBe(TURF_PLACEHOLDER_IMAGE);
    expect(resolveImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(resolveImageUrl('//example.com/a.jpg')).toBe('//example.com/a.jpg');
  });

  it('returns undefined for missing values rather than a broken src', () => {
    expect(resolveImageUrl(undefined)).toBeUndefined();
    expect(resolveImageUrl(null)).toBeUndefined();
    expect(resolveImageUrl('')).toBeUndefined();
  });
});

describe('turfCoverImage', () => {
  it('uses the first image as the cover', () => {
    expect(turfCoverImage(['/api/images/507f1f77bcf86cd799439011', '/api/images/507f1f77bcf86cd799439012'])).toBe(
      `${API_ORIGIN}/api/images/507f1f77bcf86cd799439011`
    );
  });

  it('falls back to the placeholder when a turf has no photos', () => {
    expect(turfCoverImage([])).toBe(TURF_PLACEHOLDER_IMAGE);
    expect(turfCoverImage(undefined)).toBe(TURF_PLACEHOLDER_IMAGE);
  });
});
