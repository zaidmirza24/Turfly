import { Router } from "express";
import {
  getStats,
  getAllTurfs,
  getTurfDetail,
  approveTurf,
  rejectTurf,
  getAllUsers,
  setUserBanned,
  getAllBookings,
  getAllCustomers,
  getCustomerDetail,
  getAuditLog,
} from "./admin.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

router.use(protect, authorize("ADMIN"));

router.get("/stats", getStats);

router.get("/turfs", getAllTurfs);
router.get("/turfs/:id", getTurfDetail);
router.patch("/turfs/:id/approve", approveTurf);
router.patch("/turfs/:id/reject", rejectTurf);

router.get("/users", getAllUsers);
router.patch("/users/:id/ban", setUserBanned);

router.get("/bookings", getAllBookings);

router.get("/customers", getAllCustomers);
router.get("/customers/:userId", getCustomerDetail);

router.get("/audit-log", getAuditLog);

export default router;
