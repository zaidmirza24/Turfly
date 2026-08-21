import { Router } from "express";
import { createReview, getReviewsForTurf, canReview } from "./review.controller.js";
import { protect } from "../../common/middlewares/auth.js";

const router = Router();

// GET /api/reviews/:turfId — public
router.get("/:turfId", getReviewsForTurf);

// GET /api/reviews/:turfId/eligibility — logged-in user only
router.get("/:turfId/eligibility", protect, canReview);

// POST /api/reviews/:turfId — logged-in user only, gated on a real booking
router.post("/:turfId", protect, createReview);

export default router;
