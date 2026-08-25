import { Router } from "express";
import {
  lockSlot,
  lockMultipleSlots,
  holdSlotsForSummary,
  releaseLock,
  getMyBookings,
  getOwnerBookings,
  cancelBooking,
  cancelBookingAsOwner,
  markBookingNoShow,
  createManualBooking,
  getOwnerStats,
  getOwnerCustomers,
  getOwnerCustomerDetail,
  getTurfBookings,
  markBookingPaidOut,
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

// POST /api/bookings/lock-multi — lock 1-10 contiguous slots without
// confirming (step 1 of the real-payment checkout flow: lock → create
// Razorpay order against these slots → pay → server-side confirm).
//
// There is deliberately no customer-facing route that confirms a booking
// without a verified payment. Booking confirmation for a paying customer
// only ever happens server-side, inside payment.service.js's
// finalizePaymentSuccess, after Razorpay signature/webhook verification —
// never directly off a client request. (bookSlot/confirmSlot/
// bookMultipleSlots still exist as plain functions in booking.service.js:
// they're used internally by finalizePaymentSuccess and by the owner-only
// createManualBooking/cash-booking flow below, just never exposed over HTTP
// to a USER.)
router.post("/lock-multi", protect, authorize("USER"), lockLimiter, lockMultipleSlots);

// POST /api/bookings/hold-summary — short 1-minute hold applied the moment
// the customer opens the booking summary screen, before they've committed to
// paying. Reuses the same rate limit as /lock-multi.
router.post("/hold-summary", protect, authorize("USER"), lockLimiter, holdSlotsForSummary);

// POST /api/bookings/release — customer backed out of checkout (payment
// popup dismissed, tab closed) and wants their hold freed immediately
// instead of waiting out the lock/reservation TTL. Not rate-limited like
// /lock — this only ever gives up inventory, never claims it, so there's no
// abuse incentive to throttle.
router.post("/release", protect, authorize("USER"), releaseLock);

// GET /api/bookings — dynamic route based on role
router.get("/", protect, (req, res) => {
  if (req.user.role === "OWNER") return getOwnerBookings(req, res);
  return getMyBookings(req, res);
});

// GET /api/bookings/me — user's own bookings
router.get("/me", protect, getMyBookings);

// GET /api/bookings/owner — all bookings for an owner
router.get("/owner", protect, authorize("OWNER"), getOwnerBookings);

// GET /api/bookings/owner/stats — dashboard headline figures, aggregated
// server-side. Declared before /owner/customers/:userId so neither shadows
// the other.
router.get("/owner/stats", protect, authorize("OWNER"), getOwnerStats);

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

// PATCH /api/bookings/:id/no-show — owner/admin records that the customer
// never turned up. Distinct from cancelling: the money stays with the venue
// and the slot stays consumed.
router.patch("/:id/no-show", protect, authorize("OWNER", "ADMIN"), markBookingNoShow);

// PATCH /api/bookings/:id/payout — admin records having paid the owner their
// share of this booking outside the app. Admin-only, deliberately not
// reachable by OWNER — an owner marking their own payout paid would have
// every incentive to do so without actually being paid.
router.patch("/:id/payout", protect, authorize("ADMIN"), markBookingPaidOut);

// GET /api/bookings/turf/:turfId — owner views bookings for their turf
router.get(
  "/turf/:turfId",
  protect,
  authorize("OWNER"),
  getTurfBookings
);

export default router;
