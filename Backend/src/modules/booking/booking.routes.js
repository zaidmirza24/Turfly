import { Router } from "express";
import {
  lockSlot,
  confirmSlot,
  bookSlot,
  getMyBookings,
  getOwnerBookings,
  cancelBooking,
  getTurfBookings,
} from "./booking.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

// POST /api/bookings/lock — Step 1: atomically lock a slot (5 min TTL)
router.post("/lock", protect, authorize("USER"), lockSlot);

// POST /api/bookings/confirm — Step 2: confirm lock → create booking
router.post("/confirm", protect, authorize("USER"), confirmSlot);

// POST /api/bookings — instant book (lock + confirm in one call)
router.post("/", protect, authorize("USER"), bookSlot);

// GET /api/bookings — dynamic route based on role
router.get("/", protect, (req, res) => {
  if (req.user.role === "OWNER") return getOwnerBookings(req, res);
  return getMyBookings(req, res);
});

// GET /api/bookings/me — user's own bookings
router.get("/me", protect, getMyBookings);

// GET /api/bookings/owner — all bookings for an owner
router.get("/owner", protect, authorize("OWNER"), getOwnerBookings);

// DELETE /api/bookings/:id — user cancels booking
router.delete("/:id", protect, authorize("USER"), cancelBooking);

// GET /api/bookings/turf/:turfId — owner views bookings for their turf
router.get(
  "/turf/:turfId",
  protect,
  authorize("OWNER"),
  getTurfBookings
);

export default router;
