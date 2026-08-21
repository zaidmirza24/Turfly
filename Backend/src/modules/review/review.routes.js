import { Router } from "express";
import {
  createReview, updateReview, reportReview, respondToReview,
  getReviewsForTurf, canReview,
} from "./review.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

// GET /api/reviews/:turfId — public
router.get("/:turfId", getReviewsForTurf);

// GET /api/reviews/:turfId/eligibility — logged-in user only
router.get("/:turfId/eligibility", protect, canReview);

// POST /api/reviews/:turfId — logged-in user only, gated on a real booking
router.post("/:turfId", protect, createReview);

// PATCH /api/reviews/id/:reviewId — the reviewer editing their own review
router.patch("/id/:reviewId", protect, updateReview);

// POST /api/reviews/id/:reviewId/report — any logged-in user
router.post("/id/:reviewId/report", protect, reportReview);

// POST /api/reviews/id/:reviewId/response — the turf's owner only
router.post("/id/:reviewId/response", protect, authorize("OWNER"), respondToReview);

export default router;
