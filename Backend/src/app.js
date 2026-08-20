import "express-async-errors";
import express from "express";
import cors from "cors";

import errorHandler from "./common/middlewares/errorHandler.js";

// Route imports
import authRoutes from "./modules/auth/auth.routes.js";
import turfRoutes from "./modules/turf/turf.routes.js";
import slotRoutes from "./modules/slot/slot.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import cronRoutes from "./modules/cron/cron.routes.js";

/**
 * Pure Express app — no app.listen(), no background jobs.
 * Shared by:
 *  - src/server.js (local/traditional hosting — calls app.listen())
 *  - api/index.js  (Vercel serverless entry point)
 */
const app = express();

// ── Global Middleware ──
app.use(cors());
app.use(express.json());

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
app.use("/api/cron", cronRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global Error Handler (MUST be last) ──
app.use(errorHandler);

export default app;
