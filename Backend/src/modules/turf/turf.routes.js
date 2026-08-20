import { Router } from "express";
import { createTurf, getAllTurfs, getTurfById, updateTurf } from "./turf.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

// POST /api/turfs — owner only
router.post("/", protect, authorize("OWNER"), createTurf);

// GET /api/turfs — public
router.get("/", getAllTurfs);

// GET /api/turfs/my-turfs — owner only
router.get("/my-turfs", protect, authorize("OWNER"), (req, res, next) => {
  req.query.ownerId = req.user._id;
  next();
}, getAllTurfs);

// GET /api/turfs/:id — public
router.get("/:id", getTurfById);

// PATCH /api/turfs/:id — owner only
router.patch("/:id", protect, authorize("OWNER"), updateTurf);

export default router;
