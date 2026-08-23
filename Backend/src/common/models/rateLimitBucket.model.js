import mongoose from "mongoose";

/**
 * Shared, cross-instance counter for the fixed-window rate limiter
 * (see ../middlewares/rateLimit.js). Backed by MongoDB rather than an
 * in-process Map so the limit actually holds under Vercel's serverless
 * deployment, where concurrent requests can land on different lambda
 * instances that each started with an empty in-memory counter.
 *
 * One document per (route, client) bucket. `resetAt` doubles as the TTL
 * field: once a window is over, MongoDB's background TTL sweep reclaims the
 * document on its own — no cleanup job needed, same "self-healing" pattern
 * already used for slot locks (see releaseExpiredLocks.js) and orphaned
 * images (Image.expiresAt).
 */
const rateLimitBucketSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  resetAt: { type: Date, required: true },
});

rateLimitBucketSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitBucket = mongoose.model("RateLimitBucket", rateLimitBucketSchema);
export default RateLimitBucket;
