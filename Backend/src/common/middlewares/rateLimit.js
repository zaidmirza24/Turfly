import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import RateLimitBucket from "../models/rateLimitBucket.model.js";

const log = logger.child({ module: "rateLimit" });

/**
 * Fixed-window rate limiter, backed by MongoDB so the count is shared across
 * every instance of this process — required on Vercel, where concurrent
 * requests routinely land on different serverless instances that would each
 * otherwise keep their own empty in-memory counter (the previous
 * implementation's actual behavior in production: the limit looked real in
 * dev, but was close to a no-op under real multi-instance traffic).
 *
 * One atomic `findOneAndUpdate` per request does all the work: a pipeline
 * update reads the document's own current `resetAt` in the same operation
 * that writes it, so two concurrent requests against the same bucket can
 * never both win a "start a new window" race the way a separate
 * read-then-write would. This mirrors the same atomic-update pattern already
 * used for slot locking (see booking.service.js `lockSlot`).
 */
const claimBucket = (key, windowMs, now) =>
  RateLimitBucket.findOneAndUpdate(
    { key },
    [
      {
        $set: {
          count: {
            $cond: [
              { $or: [{ $eq: ["$resetAt", null] }, { $lte: ["$resetAt", now] }] },
              1,
              { $add: ["$count", 1] },
            ],
          },
          resetAt: {
            $cond: [
              { $or: [{ $eq: ["$resetAt", null] }, { $lte: ["$resetAt", now] }] },
              new Date(now.getTime() + windowMs),
              "$resetAt",
            ],
          },
        },
      },
    ],
    { upsert: true, new: true }
  );

export const rateLimit = ({ windowMs, max, message = "Too many requests — please try again later" }) => {
  return async (req, _res, next) => {
    const now = new Date();
    const key = `${req.baseUrl}${req.path}:${clientKey(req)}`;

    let bucket;
    try {
      bucket = await claimBucket(key, windowMs, now);
    } catch (err) {
      if (err.code === 11000) {
        // No matching document existed yet, and two concurrent requests both
        // tried to insert the first one for this window — findOneAndUpdate's
        // upsert isn't atomic against that specific race. The loser here just
        // means the winner's insert already exists; retrying now finds it and
        // increments normally, so the limit still holds under the exact burst
        // traffic it exists to catch, instead of that burst being the one
        // case that falls through to fail-open below.
        try {
          bucket = await claimBucket(key, windowMs, now);
        } catch (retryErr) {
          log.warn("Rate limit check failed open after retry", { err: retryErr, key });
          return next();
        }
      } else {
        // A rate limiter must never be the reason a legitimate request fails
        // — if the DB write itself errors (a transient connection hiccup),
        // fail open and let the request through rather than 500ing on an
        // infrastructure problem unrelated to the caller.
        log.warn("Rate limit check failed open", { err, key });
        return next();
      }
    }

    if (bucket.count > max) {
      throw new ApiError(429, message);
    }

    next();
  };
};

const clientKey = (req) => {
  // Behind Vercel/most proxies the socket address is the proxy's, so prefer
  // the forwarded client address when present.
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export default rateLimit;
