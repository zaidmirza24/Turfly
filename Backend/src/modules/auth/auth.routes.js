import { Router } from "express";
import { register, login } from "./auth.controller.js";
import { rateLimit } from "../../common/middlewares/rateLimit.js";

const router = Router();

// Credential endpoints are the platform's brute-force surface: login is an
// online password oracle, and register lets an attacker enumerate which
// emails exist (it 409s on a taken address). Both are throttled per client IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts — please try again in a few minutes",
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many accounts created from this address — please try again later",
});

// POST /api/auth/register
router.post("/register", registerLimiter, register);

// POST /api/auth/login
router.post("/login", loginLimiter, login);

export default router;
