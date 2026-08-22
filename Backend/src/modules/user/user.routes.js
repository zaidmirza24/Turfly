import { Router } from "express";
import {
  getMe, updateMe, changePassword, deleteMe,
  getFavorites, addFavorite, removeFavorite,
  searchCustomers, createGuestCustomer,
} from "./user.controller.js";
import { protect, authorize } from "../../common/middlewares/auth.js";

const router = Router();

router.use(protect);

router.get("/me", getMe);
router.patch("/me", updateMe);
router.post("/me/change-password", changePassword);
router.delete("/me", deleteMe);

router.get("/me/favorites", getFavorites);
router.post("/me/favorites/:turfId", addFavorite);
router.delete("/me/favorites/:turfId", removeFavorite);

// Manual-booking customer lookup — owner only.
router.get("/search", authorize("OWNER"), searchCustomers);
router.post("/guest", authorize("OWNER"), createGuestCustomer);

export default router;
