import { Router } from "express";
import {
  getStats,
  getAllTurfs,
  approveTurf,
  rejectTurf,
  getAllUsers,
  setUserBanned,
} from "./admin.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

router.use(protect, authorize("ADMIN"));

router.get("/stats", getStats);

router.get("/turfs", getAllTurfs);
router.patch("/turfs/:id/approve", approveTurf);
router.patch("/turfs/:id/reject", rejectTurf);

router.get("/users", getAllUsers);
router.patch("/users/:id/ban", setUserBanned);

export default router;
