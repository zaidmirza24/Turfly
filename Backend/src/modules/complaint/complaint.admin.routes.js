import { Router } from "express";
import { getAllComplaints, getComplaintDetail, resolveComplaint } from "./complaint.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

router.use(protect, authorize("ADMIN"));

router.get("/", getAllComplaints);
router.get("/:id", getComplaintDetail);
router.patch("/:id/resolve", resolveComplaint);

export default router;
