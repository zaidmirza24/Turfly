import "express-async-errors";
import express from "express";
import cors from "cors";

import env from "./common/config/env.js";
import connectDB from "./common/config/db.js";
import errorHandler from "./common/middlewares/errorHandler.js";
import { initSlotCleanupJob } from "./common/jobs/slotCleanup.js";

// Route imports
import authRoutes from "./modules/auth/auth.routes.js";
import turfRoutes from "./modules/turf/turf.routes.js";
import slotRoutes from "./modules/slot/slot.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";

const app = express();

// ── Global Middleware ──
app.use(cors());
app.use(express.json());

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

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global Error Handler (MUST be last) ──
app.use(errorHandler);

// ── Start Server ──
const start = async () => {
  await connectDB();

  // Initialize background jobs
  initSlotCleanupJob();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
};

start();
