import { Router } from "express";
import { createOrder, verify, getPayment } from "./payment.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";

const router = Router();

// Same reasoning as bookings/lock — creating a Razorpay order is not free
// (it's a real API call to Razorpay) and shouldn't be scriptable at will.
const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: "Too many payment attempts — please wait a moment and try again",
});

// POST /api/payments/create-order — Phase 4
router.post("/create-order", protect, authorize("USER"), createOrderLimiter, createOrder);

// POST /api/payments/verify — Phase 6/7
router.post("/verify", protect, authorize("USER"), verify);

// GET /api/payments/:id — customer/owner/admin read (polling + receipt)
router.get("/:id", protect, getPayment);

export default router;
