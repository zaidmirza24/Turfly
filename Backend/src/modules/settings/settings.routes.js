import { Router } from "express";
import { getSettings, updateCommissionRate } from "./settings.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

router.use(protect, authorize("ADMIN"));

router.get("/", getSettings);
router.patch("/commission", updateCommissionRate);

export default router;
