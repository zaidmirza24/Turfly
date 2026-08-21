import ApiError from "../utils/ApiError.js";

/**
 * Minimal fixed-window rate limiter.
 *
 * In-process and in-memory on purpose — no extra dependency, no Redis to
 * operate. The trade-off is real and worth stating: the counter lives in one
 * process, so it does not coordinate across multiple instances or across
 * serverless invocations that land on different lambdas. It still removes the
 * cheap, single-connection credential-stuffing case (thousands of guesses a
 * minute down a keep-alive connection), which is what the auth endpoints are
 * exposed to today. If this ever runs behind more than one instance, swap the
 * store for a shared one — the middleware signature stays the same.
 */
const buckets = new Map();

const clientKey = (req) => {
  // Behind Vercel/most proxies the socket address is the proxy's, so prefer
  // the forwarded client address when present.
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export const rateLimit = ({ windowMs, max, message = "Too many requests — please try again later" }) => {
  return (req, _res, next) => {
    const now = Date.now();
    const key = `${req.baseUrl}${req.path}:${clientKey(req)}`;
    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > max) {
        throw new ApiError(429, message);
      }
    }

    // Opportunistic sweep so the map can't grow without bound across a long
    // -lived process. Cheap: only runs on ~1 in 100 requests.
    if (buckets.size > 500 && Math.random() < 0.01) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }

    next();
  };
};

export default rateLimit;
