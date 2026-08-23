import { Router } from "express";
import { register, login, forgotPassword, resetPassword } from "./auth.controller.js";
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

// Same reasoning as login: an unthrottled forgot-password endpoint is both a
// spam vector (mail-bomb an inbox with reset links) and a slow email-
// enumeration oracle (timing/response differences across many attempts).
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many reset requests — please try again in a few minutes",
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts — please try again in a few minutes",
});

// POST /api/auth/register
router.post("/register", registerLimiter, register);

// POST /api/auth/login
router.post("/login", loginLimiter, login);

// POST /api/auth/forgot-password
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

// POST /api/auth/reset-password
router.post("/reset-password", resetPasswordLimiter, resetPassword);

export default router;
