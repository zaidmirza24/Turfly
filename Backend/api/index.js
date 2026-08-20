import connectDB from "../src/common/config/db.js";
import app from "../src/app.js";

/**
 * Vercel serverless entry point.
 *
 * An Express app is itself a valid (req, res) request handler, so we can
 * hand off to it directly — we just need to make sure the (cached) DB
 * connection is ready first. connectDB() memoizes the connection on
 * `global`, so this only actually reconnects on a cold start; warm
 * invocations resolve instantly.
 *
 * No app.listen() here — Vercel's Node.js runtime calls this exported
 * handler per-request, it does not run a long-lived server process.
 */
export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}
