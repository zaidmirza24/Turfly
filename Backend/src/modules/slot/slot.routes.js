import { Router } from "express";
import { createSlots, getSlots, deleteSlots, updateSlots, setSlotsStatus } from "./slot.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";

const router = Router();

// This is a public, unauthenticated endpoint that can *write*: asking for a
// date range provisions any missing slot documents for it, and sweeps expired
// locks. That makes it the one read path where request volume turns into
// database write load, so it needs a throttle that a plain listing wouldn't.
// Generous enough for real use — the booking picker polls every 15s per open
// tab, and a customer flipping through dates fires one request each.
const slotReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many availability requests — please slow down and try again shortly",
});

// POST /api/slots — owner only
router.post("/", protect, authorize("OWNER"), createSlots);

// GET /api/slots?turfId=xxx&date=2026-01-15&status=AVAILABLE
router.get("/", slotReadLimiter, getSlots);

// DELETE /api/slots — owner only, clear by date or range
router.delete("/", protect, authorize("OWNER"), deleteSlots);

// PATCH /api/slots — owner only, bulk price update
router.patch("/", protect, authorize("OWNER"), updateSlots);

// PATCH /api/slots/status — owner only, bulk set AVAILABLE/CLOSED/FULL
router.patch("/status", protect, authorize("OWNER"), setSlotsStatus);

export default router;
