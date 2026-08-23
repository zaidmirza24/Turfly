import "express-async-errors";
import express from "express";
import cors from "cors";

import env from "./common/config/env.js";
import errorHandler from "./common/middlewares/errorHandler.js";
import { requestContext, requestLogger } from "./common/middlewares/requestLogger.js";

// Route imports
import authRoutes from "./modules/auth/auth.routes.js";
import turfRoutes from "./modules/turf/turf.routes.js";
import slotRoutes from "./modules/slot/slot.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import imageRoutes from "./modules/image/image.routes.js";
import logRoutes from "./modules/logs/logs.routes.js";
import reviewRoutes from "./modules/review/review.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import paymentWebhookRoutes from "./modules/payment/payment.webhook.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";

/**
 * Pure Express app — no app.listen(), no background jobs.
 * Shared by:
 *  - src/server.js (local/traditional hosting — calls app.listen())
 *  - api/index.js  (Vercel serverless entry point)
 */
const app = express();

// Don't advertise the framework in every response header.
app.disable("x-powered-by");

// ── Global Middleware ──

// First in the chain: everything after this point logs with a request id, and
// the id is echoed to the client so a failure can be traced back to its lines.
app.use(requestContext);
app.use(requestLogger);

// Origin allow-list, comma-separated in CORS_ORIGINS (e.g. the deployed
// frontend's URL). env.js already refuses to start in production if this is
// unset, so `null` here only ever means "local/dev, deliberately open."
const allowedOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null;

app.use(
  cors(
    allowedOrigins
      ? {
          origin: (origin, callback) => {
            // No Origin header = same-origin, curl, or a server-side caller.
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
          },
          // The request id has to be readable by the browser for the frontend
          // to attach it to a client-side error report.
          exposedHeaders: ["x-request-id"],
        }
      : { exposedHeaders: ["x-request-id"] }
  )
);

// Mounted BEFORE express.json(): the Razorpay webhook needs the untouched
// raw request body to verify X-Razorpay-Signature (Phase 8). Every other
// route below is fine with parsed JSON.
app.use("/api/payments/webhook", paymentWebhookRoutes);

// A JSON body cap: express.json() defaults to 100kb, but making it explicit
// keeps a bulk slot payload from being the thing that decides the limit.
app.use(express.json({ limit: "200kb" }));

// Baseline security headers. Deliberately hand-rolled rather than pulling in
// helmet — this is a JSON API with no HTML surface of its own, so the useful
// subset is small.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.get("/", (_req, res) => {
  res.send("Turf API is running");
});

// ── Health Check ──
app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "TURF API is running 🏟️" });
});

// ── API Routes ──
app.use("/api/auth", authRoutes);
app.use("/api/turfs", turfRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global Error Handler (MUST be last) ──
app.use(errorHandler);

export default app;
