import { Router } from "express";
import { createSlots, getSlots, deleteSlots, updateSlots, setSlotsStatus } from "./slot.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

// POST /api/slots — owner only
router.post("/", protect, authorize("OWNER"), createSlots);

// GET /api/slots?turfId=xxx&date=2026-01-15&status=AVAILABLE
router.get("/", getSlots);

// DELETE /api/slots — owner only, clear by date or range
router.delete("/", protect, authorize("OWNER"), deleteSlots);

// PATCH /api/slots — owner only, bulk price update
router.patch("/", protect, authorize("OWNER"), updateSlots);

// PATCH /api/slots/status — owner only, bulk set AVAILABLE/CLOSED/FULL
router.patch("/status", protect, authorize("OWNER"), setSlotsStatus);

export default router;
