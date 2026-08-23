import { Router } from "express";
import { createComplaint, getMyComplaints } from "./complaint.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

// POST /api/complaints — player or owner files a complaint
router.post("/", protect, authorize("USER", "OWNER"), createComplaint);

// GET /api/complaints/me — the caller's own complaints
router.get("/me", protect, authorize("USER", "OWNER"), getMyComplaints);

export default router;
