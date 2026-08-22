import { Router } from "express";
import {
  lockSlot,
  lockMultipleSlots,
  confirmSlot,
  bookSlot,
  bookMultipleSlots,
  getMyBookings,
  getOwnerBookings,
  cancelBooking,
  cancelBookingAsOwner,
  markBookingRefunded,
  createManualBooking,
  getOwnerCustomers,
  getOwnerCustomerDetail,
  getTurfBookings,
} from "./booking.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";

const router = Router();

// Locking a slot is the endpoint that actually removes inventory from
// availability (for up to 5 minutes each time), so — unlike a plain read —
// it needs its own throttle: without one, a single account can script
// repeated /lock calls across many slots/turfs with no cost, holding out
// real customers. Generous enough for a real checkout retrying a race loss.
const lockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many booking attempts — please wait a moment and try again",
});

// POST /api/bookings/lock — Step 1: atomically lock a slot (5 min TTL)
router.post("/lock", protect, authorize("USER"), lockLimiter, lockSlot);

// POST /api/bookings/confirm — Step 2: confirm lock → create booking
router.post("/confirm", protect, authorize("USER"), confirmSlot);

// POST /api/bookings/lock-multi — lock 1-10 contiguous slots without
// confirming (step 1 of the real-payment checkout flow: lock → create
// Razorpay order against these slots → pay → server-side confirm).
router.post("/lock-multi", protect, authorize("USER"), lockLimiter, lockMultipleSlots);

// POST /api/bookings — instant book (lock + confirm in one call)
router.post("/", protect, authorize("USER"), lockLimiter, bookSlot);

// POST /api/bookings/multi — instant book multiple slots (all-or-nothing)
router.post("/multi", protect, authorize("USER"), lockLimiter, bookMultipleSlots);

// GET /api/bookings — dynamic route based on role
router.get("/", protect, (req, res) => {
  if (req.user.role === "OWNER") return getOwnerBookings(req, res);
  return getMyBookings(req, res);
});

// GET /api/bookings/me — user's own bookings
router.get("/me", protect, getMyBookings);

// GET /api/bookings/owner — all bookings for an owner
router.get("/owner", protect, authorize("OWNER"), getOwnerBookings);

// GET /api/bookings/owner/customers — aggregated customer list
router.get("/owner/customers", protect, authorize("OWNER"), getOwnerCustomers);

// GET /api/bookings/owner/customers/:userId — one customer's detail
router.get("/owner/customers/:userId", protect, authorize("OWNER"), getOwnerCustomerDetail);

// POST /api/bookings/manual — owner books on a customer's behalf (phone/walk-in)
router.post("/manual", protect, authorize("OWNER"), createManualBooking);

// DELETE /api/bookings/:id — user cancels booking
router.delete("/:id", protect, authorize("USER"), cancelBooking);

// PATCH /api/bookings/:id/cancel — owner/admin cancels a customer's booking
router.patch("/:id/cancel", protect, authorize("OWNER", "ADMIN"), cancelBookingAsOwner);

// PATCH /api/bookings/:id/refund — owner/admin marks a cancelled booking refunded
router.patch("/:id/refund", protect, authorize("OWNER", "ADMIN"), markBookingRefunded);

// GET /api/bookings/turf/:turfId — owner views bookings for their turf
router.get(
  "/turf/:turfId",
  protect,
  authorize("OWNER"),
  getTurfBookings
);

export default router;
