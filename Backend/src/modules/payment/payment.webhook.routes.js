import { Router } from "express";
import express from "express";
import { webhook } from "./payment.controller.js";

const router = Router();

// Razorpay signs the exact raw bytes it sent — parsing/mutating the body
// before verification (e.g. the app's global express.json()) would make
// signature verification check re-serialized JSON instead of what was
// actually signed, silently breaking it the moment key order or whitespace
// differs. This router is mounted in app.js BEFORE express.json() runs, so
// req.body here is the untouched raw Buffer (Phase 8, explicit rule).
router.post("/", express.raw({ type: "application/json", limit: "1mb" }), webhook);

export default router;
